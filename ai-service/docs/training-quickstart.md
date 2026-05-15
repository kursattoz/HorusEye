# Training Quickstart — v1.0 → v2.0 → v3.0

End-to-end recipe for going from "stock YOLOv8n is active" to "fine-tuned
HorusEye v1.0/2.0/3.0 is serving production traffic". One-pager —
deeper details live under `docs/sprint{15,16,18}-*.md`.

## Prereqs (one-time)

| Item | How |
|---|---|
| **Roboflow API key** | 1Password → "Roboflow Universe — HorusEye CI". Paste into `.env` |
| **Supabase service-role key** | `aws ssm get-parameter --name /horuseye/staging/SUPABASE_SERVICE_ROLE_KEY --with-decryption --query Parameter.Value --output text` |
| **GPU box** | A GPU with ≥ 8GB VRAM (T4, A10, M2 Max). CPU works but ~12× slower |
| **Disk** | ~30 GB free under `ai-service/data/` for raw + converted + merged + checkpoints |

```bash
cd ai-service
cp .env.example .env
# fill in ROBOFLOW_API_KEY + SUPABASE_SERVICE_ROLE_KEY at minimum
pip install -r requirements.txt -r requirements-training.txt
```

## v1.0 — Phone & Earbuds & Smartwatch (Sprint 15)

Single command:

```bash
# Dry-run first to see the plan
./scripts/train_v1.sh --dry-run --device cuda:0

# Real run (~3-6 hours on T4)
./scripts/train_v1.sh --device cuda:0
```

The orchestrator runs:

1. **Preflight** (`preflight_training.py`) — fails fast on missing env / deps / disk / GPU
2. **Fetch** — COCO subset + OID V7 phone/book/headphones/watch + Roboflow Universe
3. **In-ear filter** — splits OID Headphones into in-ear vs over-ear (BL-277)
4. **Convert** each bundle → YOLO format
5. **Validate** — PRD-017 §6.3 quality report per bundle
6. **Merge** → `data/merged/sprint15_v1/data.yaml`
7. **Fine-tune** — yolov8n starting from COCO weights, ~50 epochs
8. **Benchmark + register** — runs against the frozen 150-frame phone benchmark, gates on phone precision ≥ 0.85 / person recall ≥ 0.95, uploads `best.pt` to the `ai-model-weights` bucket, upserts an `ai_models` row (inactive until A/B sign-off)

### Flipping the model active (after A/B sign-off)

```bash
# A/B vs stock yolov8n
python -m scripts.sprint15_ab_test \
  --stock     build/benchmark_stock.json \
  --candidate build/benchmark_sprint15_v1.json \
  --regression-tolerance 0.02

# If "passed": true, register again with --activate
python -m scripts.sprint15_benchmark_and_register \
  --weights        runs/sprint15_v1/weights/best.pt \
  --benchmark-data test-data/phone_benchmark/sprint15_v1 \
  --ground-truth   test-data/phone_benchmark/sprint15_v1/ground_truth.json \
  --report-out     build/benchmark_sprint15_v1.json \
  --model-name     yolov8n-horuseye \
  --model-version  v1.0.0-sprint15 \
  --activate

# AI service picks up the new weights on next ECS deploy
aws ecs update-service \
  --cluster HorusEye-AiService-Staging-... \
  --service ... \
  --force-new-deployment \
  --region eu-west-1
```

Then soak 24h in staging → repeat the activate + force-new-deployment against the production stack.

## v2.0 — Paper Notes & Pencil Case & Calculator (Sprint 16)

```bash
# Same shape — fetches Sprint 16 sources + negatives, merges with v1.0 carry-overs,
# fine-tunes starting from runs/sprint15_v1/weights/best.pt
./scripts/sprint16_merge_v2.sh
./scripts/sprint16_train_v2.sh
```

Acceptance: cross-class precision via the same A/B comparator
(`scripts.sprint15_ab_test` — same script handles any candidate report).

## v3.0 — Face Covering (Sprint 18, optional)

```bash
./scripts/sprint18_fetch_face_covering.sh
# then merge + train identically to v2.0, with --start-weights=runs/sprint16_v2/weights/best.pt
```

## Recovery / restart

The orchestrator's skip flags let you resume after a failure without
re-downloading the multi-GB datasets:

```bash
./scripts/train_v1.sh --skip-fetch --device cuda:0       # convert+merge+train
./scripts/train_v1.sh --skip-fetch --skip-merge --device cuda:0   # train only
./scripts/train_v1.sh --skip-fetch --skip-merge --skip-train      # benchmark only
```

## Common failures

| Symptom | Likely cause | Fix |
|---|---|---|
| `preflight: ROBOFLOW_API_KEY unset` | `.env` not sourced | `source .env && env \| grep ROBOFLOW` to confirm |
| `preflight: torch.cuda.is_available() == False` | nvidia-driver missing or torch installed without CUDA | `pip install torch --index-url https://download.pytorch.org/whl/cu121` |
| `convert_dataset`: `data.yaml` not found | source bundle layout doesn't match — verify `data/raw/<name>/{train/images,train/labels}/` |
| `merge_datasets`: "no samples survived class mapping" | `class_mapping.yaml` doesn't list the source dir name — append the missing entry |
| benchmark gate fails | model under-trained or benchmark set drifted from training distribution — re-shoot the benchmark or extend training |

## Rollback

Models are append-only in `ai_models`. To revert:

```sql
UPDATE ai_models
SET active = (version = 'v1.0.0-sprint15')
WHERE name = 'yolov8n-horuseye';
```

…then `force-new-deployment` on the ai-service ECS service.
