# HorusEye AI Service

**Status: RESERVED — Phase 4 (Graduation Project)**

This directory will contain the Python-based AI analysis service for multi-camera exam proctoring.
See `PRD/PRD-013-camera-ai-analysis.md` for full specification.

## Planned Architecture

```
ai-service/
├── src/
│   ├── detection/      # YOLOv8 person/object detection
│   ├── analysis/       # Behavior analysis, violation scoring
│   └── api/            # FastAPI endpoints consumed by portal
├── tests/              # pytest test suite
├── models/             # Pre-trained model weights (gitignored)
├── requirements.txt    # Python dependencies
└── Dockerfile
```

## Planned Tech Stack

- **Python 3.12+**
- **FastAPI** — REST API consumed by Next.js portal
- **YOLOv8 (Ultralytics)** — person and object detection
- **OpenCV** — video frame processing
- **TensorFlow / PyTorch** — custom behavior classifiers
- **WebSocket** — real-time violation alerts to portal

## Integration with Portal

The portal communicates with this service via:
- `POST /analyze/frame` — single frame analysis
- `WS  /stream/{session_id}` — real-time stream analysis
- `GET  /health` — service health check (shown on /dev/monitor)

Feature flag in portal: `NEXT_PUBLIC_CAMERA_MODULE_ENABLED=false` until this service is ready.

## Development Setup (future)

```bash
cd ai-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.api.main:app --reload --port 8000
```
