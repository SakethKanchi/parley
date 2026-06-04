import os, tempfile
from fastapi import FastAPI, UploadFile, File, Form
from faster_whisper import WhisperModel

app = FastAPI()
_state = {"model": None, "model_name": None}

def get_model(name: str):
    if _state["model"] is None or _state["model_name"] != name:
        _state["model"] = WhisperModel(name, device="auto", compute_type="int8")
        _state["model_name"] = name
    return _state["model"]

@app.get("/health")
def health():
    return {"status": "ok", "model": _state["model_name"]}

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), model: str = Form("small"), language: str = Form("auto")):
    m = get_model(model)  # warm: rebuilds only when the requested model name changes
    suffix = os.path.splitext(file.filename or "a.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        path = tmp.name
    try:
        lang = None if language == "auto" else language
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
            pass  # cleanup failure must not mask a transcription error

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("STT_PORT", "8000")))
