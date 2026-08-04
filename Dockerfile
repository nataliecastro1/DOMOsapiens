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

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend-builder /build/dist /app/static

EXPOSE $PORT

CMD ["sh", "-c", "uvicorn main:app --host :: --port ${PORT:-8000}"]
