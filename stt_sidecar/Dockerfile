# syntax=docker/dockerfile:1
# ── Parley STT sidecar (faster-whisper + FastAPI) ─────────────────────────────
# CPU build by default. Whisper models download on first use into /models
# (mounted volume) so they survive container restarts.
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/models \
    STT_HOST=0.0.0.0 \
    STT_PORT=8000

WORKDIR /app

# libgomp1 is required by faster-whisper's CTranslate2 backend.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY stt_sidecar/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY stt_sidecar/server.py ./

RUN mkdir -p /models
VOLUME ["/models"]
EXPOSE 8000

CMD ["python", "server.py"]
