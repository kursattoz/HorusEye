# Sprint 15 — Annotation Runbook (BL-280)

**Status:** manual, owned by **project_coordinator** (+ optional second annotator).
**Estimated:** ~16 hours (split: 2 hours setup + 12 hours annotation + 2 hours QA).
**Depends on:** BL-278 (frames available), BL-279 (CVAT running).

PRD-021 §3 Sprint 15 — annotate ~700 controlled-capture frames across
4 classes for the v1.0 fine-tune. Class taxonomy here MUST match
`ai-service/configs/class_mapping.yaml` so the downstream merge step
(BL-262) doesn't drop the bundle.

## Class spec (matches target_classes in class_mapping.yaml)

| ID  | Class          | Definition                                                                                                                 | Common false-positives to avoid                                            |
|-----|----------------|----------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| 0   | `earbuds`      | In-ear (AirPods, Galaxy Buds, true-wireless). Box should hug the visible earpiece(s), no padding for the ear or hair.       | Over-ear headphones — leave **unlabelled**.                                |
| 1   | `phone`        | Any handheld smartphone. Bbox = glass-to-glass; phone case included if visible.                                            | Tablet (too large) — unlabelled. Calculator with screen → unlabelled.     |
| 2   | `book`         | Bound book, notebook, or any folded paper material with multiple pages. Bbox = full visible extent (closed or open).         | Single sheet of paper → use `paper_notes`. Tablet → unlabelled.            |
| 3   | `paper_notes`  | Loose paper, cheat sheet, sticky note, single folded sheet. Bbox = the visible paper region.                                | Spiral notebook → use `book`.                                              |
| 4*  | `smart_watch`  | Wrist-worn smart wearable with visible display. Bbox = the watch face + visible band edge.                                 | Analog watch → unlabelled. Fitness band without display → unlabelled.     |

\* Sprint 15 introduces `smart_watch` as a future class. **Label it now
even though it's not in the v1.0 class_mapping yet** — Sprint 17 will
promote it without re-annotation.

## Annotation rules (the hard parts)

1. **One bbox per instance.** Two earbuds visible = two `earbuds`
   bboxes, not one merged box.
2. **Tight, not loose.** A box larger than the object is worse than no
   box — it teaches the model to predict slop.
3. **Occlusion:** label what you see. If half a phone is hidden behind
   a hand, draw a box around the visible half. Do not infer the full
   shape.
4. **Multi-frame consistency:** if you doubt a frame, skip it and move
   on (frame skip is FREE — we have spare frames). Don't burn time on
   a single ambiguous case.
5. **Class confusion:**
   - Earbuds vs headphones → see class spec table above.
   - Phone vs calculator → calculators have button rows visible; phones don't.
   - Book vs paper_notes → bound = book, loose = paper_notes.
6. **Negative frames:** if a frame has no target class visible, **skip
   it**. Do not save an empty annotation; CVAT discards unannotated
   frames on export. The merge step's data hygiene handles negatives.

## Setup (≈ 2 hours)

1. Start CVAT (`cd ai-service/cvat && docker compose up -d`).
2. Create the `sprint15-v1` task per `sprint15-cvat-setup.md`.
3. Upload ~700 frames from `data/internal/controlled_tests/frames/`.
4. Create two annotation jobs (split frames roughly 50/50) so a second
   annotator can work in parallel.
5. Walk both annotators through this spec (15 min).

## Annotation pass (≈ 12 hours)

Working rate: **60-80 frames / hour** for a focused annotator. Pace
yourself — fatigue kills box quality.

Per-batch loop (every 50 frames):

- [ ] Save & commit the segment in CVAT
- [ ] Take a 5-minute break
- [ ] Spot-check 3 frames you just labelled: are boxes tight, are
       classes right? Fix if wrong.

## QA pass (≈ 2 hours)

Open the task in CVAT review mode. For each frame:

- [ ] All visible target objects are labelled.
- [ ] Class is correct (use the spec table when uncertain).
- [ ] Boxes are tight (≤ 5% slack on each side).
- [ ] No phantom boxes on background / fabric / shadows.

After QA, run a quick stats pass with the validator:

```bash
python -m scripts.validate_dataset \
  --path  data/converted/internal_sprint15/ \
  --output-report data/converted/internal_sprint15/quality_report.json
```

`after_cleanup.class_distribution` should show all four (five with
smart_watch) classes present with ≥ 50 instances each. If a class is
under 50, the merge step will drop it (PRD-017 §8.2). Re-shoot that
scenario before continuing.

## Hand-off to merge step

When QA is signed off:

```bash
python -m scripts.merge_datasets \
  --sources \
    data/converted/internal_sprint15 \
    data/converted/coco_phone_book \
    data/converted/oid_mobile_phone \
    data/converted/oid_book \
    data/converted/oid_headphones_in_ear \
    data/converted/oid_watch \
    data/converted/roboflow_phone_on_desk \
    data/converted/roboflow_earbuds \
    data/converted/roboflow_smartwatch \
    data/converted/roboflow_paper_notes \
  --class-map ai-service/configs/class_mapping.yaml \
  --output    data/merged/sprint15_v1
```

Register the resulting dataset on the portal via `/admin/datasets` →
New dataset (BL-267 UI). storage_path: `data/merged/sprint15_v1/`.
