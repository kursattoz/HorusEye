# Sprint 15 — CVAT Annotation Server Setup (BL-279)

PRD-021 §3 Sprint 15. Sets up a **local** CVAT instance for the
Sprint 15 controlled-capture annotation pass (BL-280). Not exposed
to the internet; runs on a single workstation.

## Why local

- ~700 Sprint 15 frames is tiny — managed CVAT cloud overkill.
- Frames are eventually anonymized (PRD-017 §18.3) but the labeller
  sees pre-blur frames; keeping the data on a single workstation
  shrinks the privacy attack surface.
- One-click teardown after the sprint.

## First run

```bash
cd ai-service/cvat
cp .env.example .env                # set CVAT_POSTGRES_PASSWORD
docker compose up -d                # ~2 min on cold pull

# Create the first superuser
docker exec -it cvat_server bash
$ python3 manage.py createsuperuser  # email, username, password
$ exit

open http://localhost:8080          # log in with the superuser
```

## Create the Sprint 15 task

In CVAT web UI → "+ Create new task":

| Field            | Value                                                                                         |
|------------------|-----------------------------------------------------------------------------------------------|
| Name             | `sprint15-v1`                                                                                 |
| Labels (4 + neg) | `earbuds`, `phone`, `book`, `paper_notes` — all rectangle. Optional `smart_watch` for Sprint 15. |
| Source           | Local folder → upload from `data/internal/controlled_tests/frames/` once BL-278 is done.        |
| Subset           | leave default                                                                                 |
| Segment size     | 100 frames / segment so two annotators can split the job                                       |
| Image quality    | 95 (default)                                                                                  |

## Labels spec

Strict rules so the export feeds the merge pipeline (BL-262) cleanly:

- One rectangle per class instance — **no polygon, no keypoint, no skeleton**.
- Bbox must include the full object (lens-to-lens for earbuds, glass-to-glass for phone).
- For occluded objects, label what you see — do NOT draw the inferred full box.
- Multi-person frames: label every visible item per person, regardless of which person owns it.
- If you can't tell what an object is (blurry/distant), leave it unlabelled. Skip the frame entirely if ≥ 50% is ambiguous.

## Export

After annotation is complete:

```bash
# Export as "YOLO 1.1" — CVAT's YOLOv5/v8-compatible format.
# We do this from the CLI rather than the UI so the path goes
# straight into the dataset pipeline.
python -m scripts.export_cvat_to_yolo \
  --cvat-url    http://localhost:8080 \
  --task-name   sprint15-v1 \
  --output      data/converted/internal_sprint15/ \
  --user        $CVAT_ADMIN_USER \
  --password    $CVAT_ADMIN_PASSWORD
```

*(`export_cvat_to_yolo.py` doesn't exist yet — when needed, wrap the
CVAT SDK's `Task.export_dataset(format='YOLO 1.1')`. For Sprint 15
the manual UI export → unzip flow is fine: download YOLO 1.1 zip from
the UI, unzip into `data/converted/internal_sprint15/`.)*

## Teardown

```bash
cd ai-service/cvat
docker compose down -v   # -v wipes the volumes — frame data goes too
```

## CVAT version notes

| Date       | Pinned tag | Reason for pin                                                                       |
|------------|-----------|--------------------------------------------------------------------------------------|
| 2026-05-13 | v2.16.0   | Sprint 15 baseline. v2.17 introduces a Postgres 15 migration that needs manual SQL. |
