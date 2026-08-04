## ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:22-slim AS frontend-builder

# Alfred serves the app at /app/roi-prototype/ — built asset URLs must
# resolve under that path (the gateway strips it before the backend sees it).
ENV VITE_BASE_URL=/app/roi-prototype/

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts
COPY frontend/ .
RUN npm run build

## ── Stage 2: Python runtime ─────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# LibreOffice provides `soffice`, used to convert PPTX decks to PDF for the
# slide-by-slide preview (routes/uploads.py). Without it that preview 500s.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-impress \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend-builder /build/dist /app/static

EXPOSE $PORT

CMD ["sh", "-c", "uvicorn main:app --host :: --port ${PORT:-8000}"]
