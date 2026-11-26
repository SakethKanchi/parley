import ctypes, glob, logging, os, sysconfig, tempfile

import numpy as np
from fastapi import FastAPI, UploadFile, File, Form

log = logging.getLogger("stt_sidecar")

# STT provider: "whisper" (default) or "qwen"
STT_PROVIDER = os.environ.get("STT_PROVIDER", "whisper").lower()

# Device selection (audit B2): STT_DEVICE=auto tries cuda/float16 first and falls
# back to cpu/int8 on any init failure. Explicit values are used as-is.
STT_DEVICE = os.environ.get("STT_DEVICE", "auto")
STT_COMPUTE = os.environ.get("STT_COMPUTE", "auto")
# Batched inference (faster-whisper 1.1+) transcribes a clip's VAD segments in
# parallel instead of one 30s window at a time — 1.7-2.6x faster on both GPU and
# CPU with near-identical accuracy (see docs/stt-research-2026-07-06.md). Batch
# size defaults per device; STT_BATCH_SIZE overrides, STT_BATCH_SIZE=0 disables.
_env_batch = os.environ.get("STT_BATCH_SIZE")
STT_BATCH_SIZE = int(_env_batch) if (_env_batch not in (None, "")) else None


def _preload_cuda_libs():
    """Load pip-installed NVIDIA runtime libs (cublas/cudnn/cuda_nvrtc/...) into
    the process before ctranslate2 dlopen()s them at inference time.

    The `nvidia-*-cu12` wheels ship their .so files under
    site-packages/nvidia/<pkg>/lib/ instead of on the system loader path, so a
    fresh model *loads* fine on cuda but the first inference call fails with
    'Library libcublas.so.12 is not found or cannot be loaded'. Preloading them
    with RTLD_GLOBAL makes them visible to ctranslate2's later dlopen calls
    without needing LD_LIBRARY_PATH set externally.
    """
    purelib = sysconfig.get_paths()["purelib"]
    pattern = os.path.join(purelib, "nvidia", "*", "lib", "*.so*")
    for path in glob.glob(pattern):
        try:
            ctypes.CDLL(path, mode=ctypes.RTLD_GLOBAL)
        except OSError as err:
            log.debug("Could not preload %s (%s); ignoring", path, err)


if STT_DEVICE in ("auto", "cuda"):
    _preload_cuda_libs()

# Load provider-specific imports
if STT_PROVIDER == "qwen":
    import torchaudio
    import librosa
    from transformers import AutoModelForCausalLM, AutoTokenizer
else:
    from faster_whisper import WhisperModel, BatchedInferencePipeline  # noqa: E402

app = FastAPI()
_state = {"model": None, "model_name": None, "device": None, "compute": None, "batched": None, "provider": STT_PROVIDER}


def _resolve_batch_size():
    """Effective batch size: explicit env wins; else per-device default (GPU can
    hold a bigger batch than CPU). Returns 0 to mean 'disabled' (sequential)."""
    if STT_BATCH_SIZE is not None:
        return max(0, STT_BATCH_SIZE)
    return 8 if _state["device"] == "cuda" else 4

def _candidates():
    """Ordered (device, compute_type) pairs to try when building a model."""
    if _state["device"] is not None:
        # A device already worked once; don't retry cuda on every model rebuild.
        return [(_state["device"], _state["compute"])]
    if STT_DEVICE != "auto":
        compute = STT_COMPUTE if STT_COMPUTE != "auto" else "default"
        return [(STT_DEVICE, compute)]
    return [
        ("cuda", STT_COMPUTE if STT_COMPUTE != "auto" else "float16"),
        ("cpu", STT_COMPUTE if STT_COMPUTE != "auto" else "int8"),
    ]

def get_whisper_model(name: str):
    if _state["model"] is not None and _state["model_name"] == name:
        return _state["model"]  # warm: rebuilds only when the requested model name changes
    candidates = _candidates()
    last_err = None
    for device, compute in candidates:
        try:
            model = WhisperModel(name, device=device, compute_type=compute)
            if device != "cpu":
                warmup_segments, _ = model.transcribe(np.zeros(1600, dtype=np.float32))
                list(warmup_segments)
        except Exception as err:
            last_err = err
            log.warning("STT device %s/%s unavailable (%s); falling back", device, compute, err)
            continue
        _state.update(model=model, model_name=name, device=device, compute=compute, batched=None)
        if device != "cpu":
            log.info("STT model %s running on %s/%s", name, device, compute)
        return model
    raise last_err


def get_qwen_model():
    """Load Qwen audio model for transcription."""
    if _state["model"] is not None and _state["model_name"] == "qwen-audio":
        return _state["model"]
    try:
        device = "cuda" if (STT_DEVICE == "auto" or STT_DEVICE == "cuda") else "cpu"
        model_name = "Qwen/Qwen-Audio-Chat"
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            device_map=device,
            torch_dtype="auto",
            trust_remote_code=True
        )
        tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
        _state.update(model=(model, tokenizer), model_name="qwen-audio", device=device, compute="auto")
        log.info("Qwen audio model loaded on %s", device)
        return (model, tokenizer)
    except Exception as err:
        log.error("Failed to load Qwen model: %s", err)
        raise


def get_batched():
    """Lazily wrap the warm model in a BatchedInferencePipeline, cached until the
    model rebuilds. Returns None if batching is disabled or the model can't be
    wrapped (e.g. a fake test model), so the caller falls back to sequential."""
    if _resolve_batch_size() <= 0:
        return None
    if _state["batched"] is not None:
        return _state["batched"]
    if not hasattr(_state["model"], "feature_extractor"):
        return None
    try:
        _state["batched"] = BatchedInferencePipeline(model=_state["model"])
    except Exception as err:
        log.warning("Batched pipeline unavailable (%s); using sequential", err)
        _state["batched"] = None
    return _state["batched"]

@app.get("/health")
def health():
    return {
        "status": "ok",
        "provider": _state["provider"],
        "model": _state["model_name"],
        "device": _state["device"],
        "compute": _state["compute"],
        "batch_size": _resolve_batch_size() if _state["provider"] == "whisper" else "N/A",
    }

@app.post("/transcribe")
def transcribe(file: UploadFile = File(...), model: str = Form("small"), language: str = Form("auto")):
    if STT_PROVIDER == "qwen":
        return _transcribe_qwen(file, language)
    else:
        return _transcribe_whisper(file, model, language)

def _transcribe_whisper(file: UploadFile, model: str, language: str):
    m = get_whisper_model(model)
    suffix = os.path.splitext(file.filename or "a.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file.file.read())
        path = tmp.name
    try:
        lang = None if language == "auto" else language
        batched = get_batched()
        if batched is not None:
            segments, info = batched.transcribe(
                path, language=lang, word_timestamps=True, batch_size=_resolve_batch_size())
        else:
            segments, info = m.transcribe(path, language=lang, word_timestamps=True)
        words, texts = [], []
        for seg in segments:
            texts.append(seg.text)
            for w in (getattr(seg, "words", None) or []):
                words.append({"word": w.word, "start": w.start, "end": w.end})
        return {"text": " ".join(t.strip() for t in texts).strip(),
                "words": words,
                "language": getattr(info, "language", language)}
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

def _transcribe_qwen(file: UploadFile, language: str):
    """Transcribe using Qwen audio model."""
    model, tokenizer = get_qwen_model()
    suffix = os.path.splitext(file.filename or "a.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file.file.read())
        path = tmp.name
    try:
        # Load audio with librosa
        waveform, sample_rate = librosa.load(path, sr=16000)
        # Prepare input for Qwen
        inputs = tokenizer(
            {"audio": waveform},
            return_tensors="pt",
            sampling_rate=sample_rate
        )
        # Transcribe
        with torch.no_grad():
            outputs = model.generate(**inputs, max_new_tokens=512)
        text = tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
        return {
            "text": text,
            "words": [],  # Qwen doesn't provide word-level timestamps
            "language": language
        }
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=os.environ.get("STT_HOST", "127.0.0.1"),
        port=int(os.environ.get("STT_PORT", "8000")),
    )
