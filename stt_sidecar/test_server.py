import io, wave, struct
from fastapi.testclient import TestClient
from server import app, _state

def make_silent_wav(seconds=1, rate=16000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(struct.pack("<" + "h" * rate * seconds, *([0] * rate * seconds)))
    buf.seek(0)
    return buf

class FakeModel:
    def transcribe(self, path, **kwargs):
        seg = type("S", (), {"text": "hello world", "start": 0.0, "end": 1.0,
                             "words": [type("W", (), {"word": "hello", "start": 0.0, "end": 0.5})()]})()
        info = type("I", (), {"language": "en"})()
        return [seg], info

def test_health():
    client = TestClient(app)
    assert client.get("/health").json()["status"] == "ok"

def test_transcribe_returns_text(monkeypatch):
    _state["model"] = FakeModel()
    client = TestClient(app)
    wav = make_silent_wav()
    r = client.post("/transcribe", files={"file": ("a.wav", wav, "audio/wav")})
    body = r.json()
    assert body["text"] == "hello world"
    assert body["words"][0]["word"] == "hello"
