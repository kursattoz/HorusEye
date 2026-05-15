# Sprint 16 — Cheat-Sheet / Hidden-Notes Scout (BL-292)

PRD-021 §3 Sprint 16 BL-292. Identifies Roboflow Universe datasets we
use to feed the `paper_notes` target class with cheat-sheet variants
that the OID `Book` / `Paper` classes don't cover.

## Acceptance gates (per dataset)

Same gates as `sprint15-roboflow-scout.md`:

- [ ] Commercial-friendly license (CC-BY 4.0 / CC0 / MIT / Apache 2.0)
- [ ] ≥ 300 unique images (relaxed from 500 because cheat-sheet is rare)
- [ ] YOLO bbox format
- [ ] Resolution ≥ 320×320
- [ ] No watermarks (50-image spot check)

## Selected datasets

| Workspace | Project              | Version | License   | Maps to     | Notes                                                            |
|-----------|----------------------|---------|-----------|-------------|------------------------------------------------------------------|
| `exam-cv` | `cheat-paper-notes`  | 1       | CC-BY 4.0 | paper_notes | Carried over from Sprint 15. Hand-written cheat sheets.          |
| `exam-cv` | `cheat-sheets`       | 2       | CC-BY 4.0 | paper_notes | Newer Sprint 16 addition — printed + hand-written variants.      |
| `exam-cv` | `hidden-notes`       | 1       | CC-BY 4.0 | paper_notes | Notes hidden in pencil case / under arm / on thigh.              |

(Slugs are placeholders — update after the scout review confirms the
real Roboflow URLs.)

## Why a separate scout doc

`sprint15-roboflow-scout.md` listed the v1.0 Sprint 15 picks. Adding to
that doc would conflate "what's already merged into v1.0" with "what's
being added for v2.0". The two scouts run independently — when Sprint
17 lands we'll add a `sprint17-roboflow-scout.md` for behavior /
posture datasets.

## Pull

The Roboflow pull is wired into `scripts/sprint16_fetch_external.sh`
under the `ROBOFLOW_BUNDLES` array. Re-read that file when bumping a
dataset version.

```bash
export ROBOFLOW_API_KEY=...   # 1Password: "Roboflow Universe — HorusEye CI"
./scripts/sprint16_fetch_external.sh
```

## Class mapping

`ai-service/configs/class_mapping.yaml` already lists the
`roboflow_cheat_sheets` + `roboflow_hidden_notes` source mappings.
Both route their label names into `paper_notes` (class id 3).

## Sign-off

A dataset is ready to merge when:

- [ ] License + size + format gates all pass.
- [ ] `scripts/convert_dataset.py --format yolov8` succeeds.
- [ ] `scripts/validate_dataset.py` reports `after_cleanup.class_distribution`
       has ≥ 100 instances mapped to `paper_notes`.
- [ ] 25-image visual spot-check confirms the bbox labels are tight.
