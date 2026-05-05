# Earbuds detection training — BL-212

Phase B custom YOLO class for `earbuds_detected`. PRD-013 §7.2 places
this at TIER-1 once a real classroom seed set has been trained. Sprint
9 (this document) lays out the procedure; Sprint 11+ runs the full
training cycle once we have ≥500 labelled frames.

## Pipeline

1. **Capture & label** — see `ai-service/test-data/earbuds/README.md`
   for capture protocol + labelme conventions.
2. **Convert** — `scripts/labelme_to_yolo.py` → YOLO format dataset.
3. **Train** — `scripts/finetune_yolo.py --register --model-name
   yolov8n-earbuds --model-version v0.1.0-seed`.
4. **Review** — proctor reviews the first 10 sessions where the new
   model fires; confirmed false positives feed back into a Sprint 11
   re-labelling round.

## Acceptance criteria

| Metric         | Target  | Phase A baseline       |
|----------------|---------|------------------------|
| mAP50          | ≥ 0.70  | n/a (no detection at all) |
| precision      | ≥ 0.75  | n/a                    |
| recall         | ≥ 0.65  | n/a                    |
| inference time | ≤ 60 ms / frame CPU | YOLOv8n baseline ~50 ms |

Below the recall target the model stays staged in `ai_models` (active=
false) and the publish handler keeps treating earbuds as out-of-class.

## ai_models lifecycle

```
trained_on    deployed_at   active
v0.1.0-seed   ─             false       ← BL-212 first run
v0.1.0-seed   <now>         true        ← post-review activation
v0.1.1        ─             false       ← BL-212 follow-up training
v0.1.1        <now>         true        ← if precision improves;
                                          v0.1.0-seed flipped to false
```

The publish handler reads `ai_models WHERE active=true AND
name='yolov8n-earbuds'` once per process start; restart the AI service
ECS task after activating a new version.

## Failure modes

| Symptom                         | Likely cause                | Fix                                       |
|---------------------------------|-----------------------------|-------------------------------------------|
| mAP50 < 0.5 after 30 epochs     | Too few seed frames         | Capture 50+ more across `partial_occlusion` |
| Precision OK, recall < 0.5     | Hair occlusion not labelled | Re-label with bud peeking through hair    |
| Per-class FP > 20%              | Glasses temple confused for bud | Add glasses negative samples            |
| inference > 100 ms              | imgsz > 640                 | Drop to 640 or use yolov8n-nano weights   |
