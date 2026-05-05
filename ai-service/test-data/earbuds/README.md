# earbuds dataset — BL-212

Phase B custom YOLO class. PRD-013 §7.2 expects ~71-80% precision on
earbuds detection once trained against a real classroom seed set.
Sprint 9's deliverable is the **dataset scaffolding + first 50-frame
seed training run**; full Phase B training (Sprint 11+) iterates on
proctor-confirmed false-positives.

## Capture

Target ~50 frames per lighting bucket (3 buckets total ≈ 150 seed
images). Each frame should contain exactly one student with visible
earbud(s) — both wired and wireless are in-class:

| Bucket           | Style                                  | Frames |
|------------------|----------------------------------------|--------|
| `wired_visible`  | Cable visible from ear → phone/laptop  | ~50    |
| `wireless_pod`   | AirPods / Galaxy Buds / similar pods   | ~50    |
| `partial_occlusion` | Hair / hood partially covering bud   | ~50    |

Resolution ≥ 640×640 (YOLO imgsz). JPEG/PNG.

## Labelling

1. Use [labelme](https://github.com/wkentaro/labelme) (rectangle tool).
2. Class label: `earbuds`.
3. Save the .json next to the .jpg (labelme default).
4. Convert to YOLO format with the converter:

   ```bash
   python -m scripts.labelme_to_yolo \\
       --in  ai-service/test-data/earbuds/raw \\
       --out ai-service/test-data/earbuds/yolo \\
       --classes earbuds
   ```

5. The converter writes:
   - `yolo/images/{train,val,test}/*.jpg`  (80/10/10 split, deterministic)
   - `yolo/labels/{train,val,test}/*.txt`
   - `yolo/data.yaml`  (matches the template in `data.yaml.example`)

## Initial training

Once labelled and converted:

```bash
cd ai-service
python -m scripts.finetune_yolo \\
    --data        test-data/earbuds/yolo/data.yaml \\
    --weights     yolov8n.pt \\
    --epochs      30 \\
    --imgsz       640 \\
    --batch       8 \\
    --output      runs/earbuds-seed-001 \\
    --register \\
    --model-name  yolov8n-earbuds \\
    --model-version v0.1.0-seed
```

The `--register` flag uploads best.pt to the `ai-model-weights` bucket
(BL-211) and inserts an ai_models row with the test-set mAP50/mAP50-95.
**Don't pass `--activate` on the seed run** — leave the model staged
until proctor review confirms the precision target on real sessions.

## Acceptance gate (Sprint 11+ full training)

| Metric         | Target  |
|----------------|---------|
| mAP50          | ≥ 0.70  |
| precision      | ≥ 0.75  |
| recall         | ≥ 0.65  |
| inference time | ≤ 60 ms / frame on CPU |

Failures fall back to the wired-only PRD-013 §7.2 baseline (~50 % FP).
