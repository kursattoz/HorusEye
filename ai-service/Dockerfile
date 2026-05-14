# Phase A — on-prem Docker (PRD-013 §12.3)
FROM python:3.12-slim

# Native deps:
#   - libGL/libglib       — opencv-python-headless + mediapipe (BL-194)
#   - build-essential     — insightface ships only sdist on PyPI for some
#     versions; pip falls back to source build which needs g++ (BL-216).
# build-essential adds ~200 MB to the image; if it ever becomes a real
# concern, swap in a multi-stage build that copies only site-packages.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*
# git: required for the `clip @ git+https://github.com/ultralytics/CLIP.git`
# entry in requirements.txt (Sprint 19, YOLO-World CLIP encoder).

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# BL-42 — pre-bake YOLOv8n weights so the first request doesn't stall
# downloading ~6 MB. Stored at /app/models/yolov8n.pt; matches config.yaml.
RUN mkdir -p models \
 && python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')" \
 && (mv yolov8n.pt models/ 2>/dev/null || true) \
 && ls -lh models/

# Sprint 19 — pre-bake YOLOv8s-WorldV2 (~25 MB) for open-vocabulary mode.
# Activated at runtime by setting DETECTOR_MODE=world; this RUN keeps the
# weight in the image so cold-start doesn't pay the ultralytics download
# tax (~10s on CPU tasks).
RUN python -c "from ultralytics import YOLO; YOLO('yolov8s-worldv2.pt')" \
 && (mv yolov8s-worldv2.pt models/ 2>/dev/null || true) \
 && ls -lh models/

# BL-216 (Sprint 10) — pre-bake insightface buffalo_l (ArcFace + RetinaFace).
# ~280 MB download skipped on first request; insightface looks for models
# under <root>/models/<pack_name>, so we point root=/app/models/insightface.
ENV INSIGHTFACE_HOME=/app/models/insightface
RUN mkdir -p "$INSIGHTFACE_HOME" \
 && python -c "from insightface.app import FaceAnalysis; \
fa = FaceAnalysis(name='buffalo_l', root='$INSIGHTFACE_HOME', providers=['CPUExecutionProvider']); \
fa.prepare(ctx_id=-1, det_size=(640, 640))" \
 && du -sh "$INSIGHTFACE_HOME"

COPY config.yaml .
# Sprint 19 — runtime YAML for YOLO-World prompts + class aliases.
# publish_handler._load_world_config reads configs/class_mapping.yaml at
# startup; without this COPY the file is missing from the image, the
# loader returns empty prompts, and DETECTOR_MODE=world silently falls
# back to COCO (person/phone/book only).
COPY configs/ ./configs/
COPY src/ ./src/

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
