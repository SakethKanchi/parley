# syntax=docker/dockerfile:1
# ── Parley bot + web dashboard ────────────────────────────────────────────────
# Multi-stage: build the React UI and compile native deps (@discordjs/opus),
# then ship a slim runtime. Node 24 LTS ships node:sqlite stable (no flag).

# 1) Build the web dashboard (Vite → web/dist)
FROM node:24-bookworm-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# 2) Install production node_modules (needs build tools for @discordjs/opus)
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 3) Runtime
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# ffmpeg-static ships its own binary; no system ffmpeg needed.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY --from=web /app/web/dist ./web/dist

# Persistent data (sqlite db + per-meeting audio) lives here.
ENV DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]

# Web dashboard (enabled by default in the container; host maps 127.0.0.1 only).
ENV WEB_UI=1 WEB_UI_PORT=3000 WEB_UI_HOST=0.0.0.0
EXPOSE 3000

CMD ["node", "src/index.js"]
