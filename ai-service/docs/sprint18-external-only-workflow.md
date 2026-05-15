# Sprint 18 — External-Only Workflow (BL-314 / BL-318 supersession)

**Decision:** Sprint 18 drops the internal multi-cam capture (BL-314)
and the cross-validation benchmark recording (BL-318). The multi-cam
modules (BL-310 coordinator, BL-311 cross-cam Re-ID, BL-313 matcher,
BL-315 severity fusion) and the face_covering rule (BL-320) ship
**code-only** and validate against:

- **For multi-cam:** synthetic embedding pairs in
  `tests/test_sprint18_modules.py` + per-pair confidence on the
  cross-camera matcher.
- **For face_covering:** the v3.0 model trained on MaskedFace-Net +
  WIDER FACE (`scripts/sprint18_fetch_face_covering.sh`). No human
  capture; both sets carry CC-BY-4.0 licenses suitable for our use.

## What we lose, what we keep

- **Lose:** real overlapping-camera footage tagged with ground truth
  for severity fusion validation.
- **Keep:** the coordinator + matcher are deterministic over their
  inputs — synthetic embeddings + the post-deploy decision metrics
  (BL-208) give us iterative tuning without staged capture.

## Compensating

1. Roll the multi-cam pipeline out to staging on a single exam room
   (PRD-013 §6.3 — the room with 2 cameras already declared in
   exam_rooms + cameras).
2. Use `/admin/camera-overlap` (BL-316) to declare the overlap zone.
3. Soak for a week of real exams. Per-rule precision shows up at
   `/api/ai-models/metrics` (BL-208).
4. If `face_covering` precision < 0.65 OR multi-cam dedup is missing
   real confirmations, fall back to a minimal one-day capture
   (volunteers + two cameras + the existing `extract_and_prelabel.py`
   pipeline) — much cheaper than the originally planned multi-day
   shoot.
