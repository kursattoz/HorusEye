# `ai-service/data/` — Dataset Pipeline Workspace

This is the **local working directory** for the dataset pipeline
described in [PRD-017 §17](../../PRD/PRD-017-dataset-training-pipeline.md#17-klasör-yapısı).
Everything here is `.gitignored` (except `.gitkeep` and this README) — the
durable copy lives in Supabase Storage buckets and the `datasets` /
`internal_training_samples` tables. See PRD-021 Tasarım Kararı §2.

## Layout

```
data/
├── raw/                # Importer output — exactly as it came off the wire
│                       # (Roboflow .zip extracts, Open Images CSV, COCO JSON).
│                       # See: scripts/import_dataset.py (BL-259)
│
├── converted/          # Normalized YOLOv8 format. data.yaml lists nc + class
│                       # names; images/ + labels/ split into train/val/test.
│                       # See: scripts/convert_dataset.py (BL-260)
│
├── merged/             # Final merged corpora ready for fine-tune. Carries a
│                       # dataset_meta.json with provenance + class_counts +
│                       # split_counts. See: scripts/merge_datasets.py (BL-262)
│
├── exports/            # Zipped packages for hand-off to the YOLOv8 trainer
│                       # or for archiving (PRD-017 §15 dataset export).
│
└── internal/           # Anonymized real-exam frames. PRD-017 §18.3 KVKK.
    ├── positives/      # Confirmed-violation frames (post anonymize_frame.py).
    ├── negatives/      # Hard negatives — useful for the false-positive set.
    ├── unreviewed/     # Raw evidence pending operator decision.
    │                   # NEVER feeds the trainer until reviewed + anonymized.
    └── controlled_tests/  # Volunteer recordings (PRD-017 §11.2). Signed
                            # consent on file; no anonymization required.
```

## Typical flow

```
import_dataset.py    → data/raw/<source>/
convert_dataset.py   → data/converted/<source>/
validate_dataset.py  → data/converted/<source>/quality_report.json
merge_datasets.py    → data/merged/<name>/ (data.yaml + dataset_meta.json)
                       ↑ may also pull from data/internal/positives|negatives
finetune_yolo.py     → reads data/merged/<name>/data.yaml
```

## Storage bucket pairing

| Local path                   | Supabase Storage bucket            | Why                                                      |
|------------------------------|------------------------------------|----------------------------------------------------------|
| `data/internal/positives/*`  | `anonymized-training-frames`       | KVKK-safe persistent copy. Private, admin-only RLS.      |
| `data/internal/negatives/*`  | `anonymized-training-frames`       | Same bucket; folder prefix distinguishes.                |
| `data/raw/`, `data/converted/`, `data/merged/`, `data/exports/` | _none_ | Ephemeral or third-party — re-fetchable from source. |

Run `gh-ssm-doctor` (or the equivalent infra check) if a script complains
about missing buckets — bucket migrations live in
`portal/supabase/migrations/*_anonymized_training_frames_bucket.sql`.
