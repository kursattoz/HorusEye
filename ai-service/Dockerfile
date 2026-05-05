# Phase A — on-prem Docker (PRD-013 §12.3)
FROM python:3.12-slim

# Native deps: libGL/libglib for opencv-python-headless and mediapipe (BL-194).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# BL-42 — pre-bake YOLOv8n weights so the first request doesn't stall
# downloading ~6 MB. Stored at /app/models/yolov8n.pt; matches config.yaml.
RUN mkdir -p models \
 && python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')" \
 && (mv yolov8n.pt models/ 2>/dev/null || true) \
 && ls -lh models/

COPY config.yaml .
COPY src/ ./src/

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
