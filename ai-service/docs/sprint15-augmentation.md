# Sprint 15 — Fallback Augmentation (BL-285)

PRD-021 §3 Sprint 15. **Low priority** — only invoke this if the main
merge (Roboflow + OID + COCO + internal) leaves any class below the
500-image floor in PRD-017 §8.2.

## Decision flow

```
After scripts/merge_datasets.py + scripts/validate_dataset.py:
  ↳ Open data/merged/sprint15_v1/quality_report.json
  ↳ Look at after_cleanup.class_distribution

  for each class:
    if count(class) ≥ 500:   skip (no top-up needed)
    if count(class) <  500:  pull the matching subset below
```

## Mapping: target class → augmentation source

| Target class    | Primary source                | Fallback (BL-285)                                   |
|-----------------|-------------------------------|-----------------------------------------------------|
| `phone`         | Roboflow + OID + COCO         | **Objects365** `Cell phone` (1000) + **LVIS** `cellphone` (1000) |
| `book`          | OID + COCO                    | **Objects365** `Book` (1000) + **LVIS** `book` (1000)             |
| `earbuds`       | OID Headphones (in-ear) + Roboflow | **LVIS** `earphone` (1000)                              |
| `smart_watch`   | OID Watch + Roboflow          | **Objects365** `Watch` (1000)                                |
| `paper_notes`   | Internal + Roboflow           | _no public set covers cheat sheets_ — re-shoot if low. |

## Invocation

```bash
# Pulls both Objects365 + LVIS subsets in one go.
./scripts/sprint15_fetch_objects365_lvis.sh
```

The wrapper invokes `scripts/import_dataset_objects365.py` and
`scripts/import_dataset_lvis.py` separately so each can fail
independently (e.g. LVIS server flaky → Objects365 still completes).

## After the pull

1. Convert each new bundle to YOLO format with the right class map:

   ```bash
   for ds in objects365_phone_book_watch lvis_phone_book_earphone; do
     python -m scripts.convert_dataset \
       --source data/raw/${ds} \
       --target data/converted/${ds} \
       --format yolov8 \
       --class-map "$(cat configs/class_mapping.yaml)"
   done
   ```

2. Add the converted dirs to the merge command in
   `docs/sprint15-roboflow-scout.md`'s "After the pull" section and
   re-run `scripts/merge_datasets.py`. The merge step's per-class cap
   (`--max-per-class 2000`) handles dedup; pulling 1000 extras when
   you already had 800 doesn't over-saturate.

## Class mapping additions

The class_mapping.yaml from PRD-017 §8.1 needs Objects365 + LVIS rows
appended:

```yaml
source_mappings:
  # ...existing...
  objects365_phone_book_watch:
    "Cell phone": 1
    "Book":       2
    "Watch":      4
  lvis_phone_book_earphone:
    "cellphone": 1
    "book":      2
    "earphone":  0
```

(IDs above match the Sprint 15 target taxonomy: 0=earbuds, 1=phone,
2=book, 3=paper_notes, 4=smart_watch.)

## Why not pull these by default

- **Disk** — full Objects365 + LVIS without class filters is ~50GB.
- **Class drift** — the LVIS `earphone` class is small and noisy;
  using it as the *primary* earbuds source would hurt v1.0. Use it
  ONLY when our better sources run dry.
- **License** — both are CC-BY-4.0 (commercial OK), but adding them to
  every merge pollutes provenance tracking. Keep them surgical.
