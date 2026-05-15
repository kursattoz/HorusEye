# Sprint 15 — Roboflow Universe Scout (BL-276)

PRD-021 §3 Sprint 15. This document records the Roboflow Universe
datasets the team picked for the Phone & Earbuds & Smartwatch fine-tune
and provides a one-shot invocation script. Datasets are versioned —
when a new revision drops, bump the `--version` flag in the wrapper.

## Acceptance gates (per dataset)

A Roboflow dataset clears the bar only when **every** check below is
green. Reject otherwise and remove from the wrapper.

- [ ] License **permits commercial / closed-source use** (CC-BY 4.0, CC0,
      MIT, Apache 2.0 — NOT CC-BY-NC).
- [ ] Class names map cleanly onto our target classes
      (`earbuds`, `phone`, `book`, `paper_notes`, `smart_watch`). The
      mapping goes into `ai-service/configs/class_mapping.yaml`.
- [ ] ≥ 500 unique images (PRD-017 §8.2 minimum per class).
- [ ] Image resolution ≥ 320×320 (PRD-017 §6.1).
- [ ] Annotations are bbox YOLO format (not polygon, not keypoint).
- [ ] No watermarked / synthetic-only images (visual spot-check ≥ 50
      random samples).

## Selected datasets (initial Sprint 15 picks)

> Pull commands listed below. Each dataset needs a one-time CLA accept
> in Roboflow web UI before the API export works. Set
> `ROBOFLOW_API_KEY` in your shell first.

| Workspace            | Project              | Version | License     | Maps to            | Notes                                                                          |
|----------------------|----------------------|---------|-------------|--------------------|--------------------------------------------------------------------------------|
| `proctoring-systems` | `phone-on-desk`      | 3       | CC-BY 4.0   | phone              | Top-down classroom angles; good match for our fixed camera POV.                |
| `wearables-lab`      | `earbuds-detection`  | 2       | MIT         | earbuds            | True wireless earbuds + AirPods variants; in-ear filter not required.          |
| `wearables-lab`      | `smartwatch-detect`  | 4       | MIT         | smart_watch        | Wrist crops at multiple angles.                                                |
| `exam-cv`            | `cheat-paper-notes`  | 1       | CC-BY 4.0   | paper_notes        | Handwritten cheat sheets — complements COCO `book`.                            |

(Replace with confirmed picks after the scout review. The exact
workspace/project slugs above are placeholders — update before
running.)

## Pull script

```bash
# Set this once per shell. The token is stashed in 1Password under
# "Roboflow Universe — HorusEye CI" (admin-only).
export ROBOFLOW_API_KEY=...

./scripts/sprint15_fetch_roboflow.sh
```

`sprint15_fetch_roboflow.sh` is a thin wrapper around
`scripts/import_dataset.py` with the per-dataset flags baked in. Edit
the script when a new Roboflow version drops, then rerun.

## After the pull

1. Convert each bundle to YOLO format with the right class map:

   ```bash
   for ds in roboflow_phone_on_desk roboflow_earbuds roboflow_smartwatch roboflow_paper_notes; do
     python -m scripts.convert_dataset \
       --source data/raw/${ds} \
       --target data/converted/${ds} \
       --format yolov8 \
       --class-map "$(jq -Rsr 'tojson' <<< "$(cat configs/class_mapping.yaml)")"
   done
   ```

2. Validate per dataset (writes quality_report.json next to each bundle):

   ```bash
   for ds in roboflow_phone_on_desk roboflow_earbuds roboflow_smartwatch roboflow_paper_notes; do
     python -m scripts.validate_dataset \
       --path data/converted/${ds} \
       --output-report data/converted/${ds}/quality_report.json
   done
   ```

3. Merge with COCO + OID (BL-262):

   ```bash
   python -m scripts.merge_datasets \
     --sources \
       data/converted/roboflow_phone_on_desk \
       data/converted/roboflow_earbuds \
       data/converted/roboflow_smartwatch \
       data/converted/roboflow_paper_notes \
       data/converted/coco_phone_book \
       data/converted/oid_mobile_phone \
       data/converted/oid_book \
       data/converted/oid_headphones_in_ear \
       data/converted/oid_watch \
     --class-map ai-service/configs/class_mapping.yaml \
     --output    data/merged/sprint15_v1 \
     --max-per-class 2000 \
     --min-per-class 50 \
     --split-ratio 0.7:0.2:0.1
   ```

4. Register on the portal via `/admin/datasets` New dataset form
   (storage_path = `data/merged/sprint15_v1/`, target_classes =
   `["earbuds","phone","book","paper_notes","smart_watch"]`).
