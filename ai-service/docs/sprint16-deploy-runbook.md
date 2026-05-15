# Sprint 16 — v2.0 Deploy Runbook (BL-295)

PRD-021 §3 Sprint 16. Staged rollout for `yolov8n-horuseye v2.0` —
the Sprint 16 fine-tune that adds `paper_notes`, `pencil_case`,
`calculator` (and refines the Sprint 15 classes).

## Decision flow

```
A/B comparator passed (BL-294 → build/ab_v2_vs_v1.json, "passed": true)
      │
      ▼
Manual sign-off (this runbook)
      │
      ▼
sprint16_benchmark_and_register.py --activate
      │
      ▼
ai-service ECS task picks up the new weights on the next restart
(restart triggered by SSM update on /horuseye/staging/AI_MODEL_VERSION
or by `cdk deploy HorusEye-AiService-Staging --force-new-deployment`)
```

## Pre-deploy checks

- [ ] `build/ab_v2_vs_v1.json` exists and `"passed": true`.
- [ ] `runs/sprint16_v2/weights/best.pt` exists.
- [ ] Phone precision in `build/benchmark_sprint16_v2.json` ≥ 0.85.
- [ ] Person recall in `build/benchmark_sprint16_v2.json` ≥ 0.95.
- [ ] No new class is silently dropped (compare
       `quality_report.after_cleanup.class_distribution` with the
       full 7-class target set).
- [ ] Spot-check 10 false positives + 10 false negatives in the
       benchmark output — look for systemic patterns.

## Staged rollout

### Stage 1 — staging only

```bash
# Step 1: upload weights + register inactive ai_models row
python -m scripts.sprint15_benchmark_and_register \
  --weights        runs/sprint16_v2/weights/best.pt \
  --benchmark-data test-data/phone_benchmark/sprint15_v1 \
  --ground-truth   test-data/phone_benchmark/sprint15_v1/ground_truth.json \
  --report-out     build/benchmark_sprint16_v2.json \
  --model-name     yolov8n-horuseye \
  --model-version  v2.0.0-sprint16
# (no --activate yet)

# Step 2: register the merged dataset on the staging portal
#   Browser → https://staging.horuseye.app/admin/datasets → "New dataset"
#   name:           "Sprint 16 v2.0 corpus"
#   version:        "2.0"
#   source_type:    "merged"
#   storage_path:   "data/merged/sprint16_v2/"
#   target_classes: ["earbuds","phone","book","paper_notes","smart_watch","pencil_case","calculator"]
# After save, copy the resulting dataset_id.

# Step 3: link the dataset to the ai_models row via the portal API
curl -sS -X PUT https://staging.horuseye.app/api/ai/datasets/<dataset_id> \
  -H "Authorization: Bearer <admin_session_token>" \
  -H "Content-Type: application/json" \
  -d '{"ai_model_id":"<ai_model_uuid>","status":"training"}'
# (uses the BL-266 PUT route — fires dataset.deploy audit event)

# Step 4: flip ai_models.active for staging
python -m scripts.sprint15_benchmark_and_register \
  --weights        runs/sprint16_v2/weights/best.pt \
  --benchmark-data test-data/phone_benchmark/sprint15_v1 \
  --ground-truth   test-data/phone_benchmark/sprint15_v1/ground_truth.json \
  --report-out     build/benchmark_sprint16_v2.json \
  --model-name     yolov8n-horuseye \
  --model-version  v2.0.0-sprint16 \
  --activate

# Step 5: nudge ai-service to pick up the new weights
aws ecs update-service \
  --cluster HorusEye-AiService-Staging-Cluster... \
  --service ... \
  --force-new-deployment \
  --region eu-west-1
```

Soak v2.0 in staging for ≥ 24 hours of real load before promoting to
production. PRD-013 §28 monitoring covers the on-call burn rate during
the soak.

### Stage 2 — production promotion

After 24h with no regression (no spike in `ai.incident` false positives
+ no `system.error` increase), repeat steps 1-5 against production:

- ai_models row already exists (`yolov8n-horuseye v2.0.0-sprint16`).
  Just flip `active` for the production environment by running steps
  3-5 with production endpoints.
- Optional: leave v1.0 inactive but registered for rapid rollback —
  `UPDATE ai_models SET active=true WHERE version='v1.0.0-sprint15'`
  if v2.0 misbehaves.

## Rollback

```sql
-- One-line rollback. The AI service redetects the active model on
-- next task restart.
UPDATE ai_models SET active = (version = 'v1.0.0-sprint15')
WHERE name = 'yolov8n-horuseye';
```

Then `force-new-deployment` on the ai-service ECS service.

## Audit trail

Every step above emits a `dataset.*` audit event (BL-271):

- `dataset.merge` on POST `/api/ai/datasets/merge`
- `dataset.deploy` on PUT `/api/ai/datasets/[id]` with `status=training`
- `dataset.annotation_complete` if you marked an `internal_training_samples`
  batch approved before training

The audit log is the canonical record of which dataset trained which
model — query `audit_logs WHERE event_type LIKE 'dataset.%'` for the
post-mortem.
