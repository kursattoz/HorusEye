# HorusEye AI Service

Python **FastAPI** service for camera AI analysis (PRD-013). **BL-24 (Phase A)** delivers a runnable scaffold: Docker, `/health`, RTSP ingestion skeleton, WebSocket routes.

## Layout (PRD-013 §12.1)

```
ai-service/
├── Dockerfile
├── docker-compose.yml
├── config.yaml
├── requirements.txt
├── src/
│   ├── main.py
│   ├── ingestion/
│   │   └── frame_reader.py   # RTSP → frames (OpenCV skeleton)
│   └── api/
│       └── ws_handler.py      # WebSocket handlers
└── tests/
```

## API (Phase A)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness JSON (`status`, `service`) |
| WS | `/ws/sessions/{session_id}/detections` | Detection / status channel (stub) |
| WS | `/ws/sessions/{session_id}/video` | Video channel (stub) |

## Local development

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

## Tests

```bash
cd ai-service
pip install -r requirements.txt
pytest
```

## On-prem Docker

```bash
cd ai-service
docker compose up --build
```

Health check: `GET http://localhost:8000/health`

Environment:

- `CORS_ORIGINS` — comma-separated origins, or `*` (default) for permissive CORS on REST (WebSocket clients use their own origin rules).

## Integration with portal

Portal env: `AI_SERVICE_URL=http://localhost:8000` (see PRD-013). Feature flag `NEXT_PUBLIC_CAMERA_MODULE_ENABLED` remains off until integration work is done.

Later phases add YOLO/MediaPipe, Supabase evidence upload, and ECS deployment (see PRD).
