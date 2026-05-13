# Sprint 15 — Phone Benchmark Recording Runbook (BL-281)

**Status:** manual, owned by **project_coordinator**.
**Estimated:** ~6 hours (4 hours recording + 2 hours ground-truth labelling).
**Builds on:** existing `scripts/benchmark_phone.py` (BL-193).

PRD-021 §3 Sprint 15. Sprint 15 ships YOLOv8n v1.0; before we promote
it past stock we need a fixed 150-frame benchmark to verify
**phone precision ≥ 85%** and **person recall ≥ 95%** (the gate from
PRD-013 §7.2). This runbook standardizes how the 150 frames are
collected and labelled so the numbers across stock vs v1.0 are
comparable.

## Why a fixed benchmark set

If we benchmark on a fresh sample every time, we can't compare two
models — the test set varies. PRD-017 §11.3 calls for a stable
benchmark held outside the training corpus.

## Setup (~1 hour)

- [ ] Same camera kit as BL-278 (desk + phone cam).
- [ ] Recruit 1-2 volunteers (one signed consent form each, file in
       `docs/internal/consents/`).
- [ ] Pre-allocate `test-data/phone_benchmark/sprint15_v1/` for the
       output frames + `ground_truth.json`.
- [ ] Verify the benchmark script runs against the existing fixture:
       `python -m scripts.benchmark_phone --help`

## Lighting matrix (~3 hours recording)

5 lighting × 6 angles × 5 scenarios = 150 frames. Each cell ≈ 1 minute.

| Lighting       | Description                                                 |
|----------------|-------------------------------------------------------------|
| `morning_sun`  | Window blinds half-open, natural light from one side       |
| `overhead_only` | All fluorescents on, blinds closed                         |
| `mixed`        | Window + overhead — typical mid-day                         |
| `low`          | Half the overheads off, dusk-like                           |
| `night`        | Only screen + monitor light — late-evening study scenario  |

| Angle          | Camera placement                                            |
|----------------|-------------------------------------------------------------|
| `desk_front`   | 60cm in front of volunteer, 30° down                        |
| `desk_oblique` | 60cm to the side, 30° down                                  |
| `wide`         | Back of room, capture 3 desks                               |
| `phone_clip`   | Phone-cam mounted at desk edge                              |
| `corner`       | Upper corner, 45° down                                      |
| `top_down`     | Directly overhead (ceiling mount)                           |

Per cell, hold the camera fixed and capture 1 minute of video including
ALL five scenarios in sequence:

1. `S_clean` — no phone, hands on desk, looking at paper
2. `S_phone_held` — phone in dominant hand, screen toward face
3. `S_phone_lap` — phone resting on lap, partially occluded
4. `S_phone_under_paper` — phone hidden under paper, partial view
5. `S_phone_table` — phone face-down on table

## Frame extraction (~30 min)

Extract one representative frame from each (lighting × angle × scenario)
cell. The existing extract path (BL-193) ran manually; for Sprint 15
codify it with a small wrapper:

```bash
# For each cell, identify the timestamp where the scenario is mid-action
# (~30s into that scenario's minute) and extract the frame.
for video in test-data/phone_benchmark/sprint15_v1/raw/*.mp4; do
  ffmpeg -ss 30 -i "$video" -frames:v 1 -q:v 2 \
    "test-data/phone_benchmark/sprint15_v1/$(basename "$video" .mp4).jpg"
done
```

Sanity: `ls test-data/phone_benchmark/sprint15_v1/*.jpg | wc -l` should
be 150.

## Ground-truth labelling (~2 hours)

`benchmark_phone.py` expects `ground_truth.json`. For Sprint 15:

```json
{
  "frames": [
    {
      "filename": "morning_sun_desk_front_S_clean.jpg",
      "lighting": "morning_sun",
      "angle":    "desk_front",
      "scenario": "S_clean",
      "people":   1,
      "phone_visible": false
    },
    {
      "filename": "morning_sun_desk_front_S_phone_held.jpg",
      "lighting": "morning_sun",
      "angle":    "desk_front",
      "scenario": "S_phone_held",
      "people":   1,
      "phone_visible": true
    }
    // ... 148 more
  ]
}
```

Quickest path: write a one-line script that loops the file list and
fills the boilerplate (lighting / angle / scenario from filename); the
labeller's only job is counting `people` in each frame.

## Running the benchmark

```bash
# Stock yolov8n
python -m scripts.benchmark_phone \
  --data-dir     test-data/phone_benchmark/sprint15_v1 \
  --ground-truth test-data/phone_benchmark/sprint15_v1/ground_truth.json \
  --weights      models/yolov8n.pt \
  --output       build/benchmark_stock.json

# Sprint 15 fine-tune (v1.0)
python -m scripts.benchmark_phone \
  --data-dir     test-data/phone_benchmark/sprint15_v1 \
  --ground-truth test-data/phone_benchmark/sprint15_v1/ground_truth.json \
  --weights      runs/sprint15_v1/weights/best.pt \
  --output       build/benchmark_sprint15_v1.json
```

A/B compare with BL-284 (see scripts/sprint15_ab_test.py).

## Acceptance

The benchmark set is sign-off-ready when:

- [ ] 150 frames present, all 1080p or higher
- [ ] `ground_truth.json` validates (150 entries, no missing fields)
- [ ] `phone_visible` distribution: ~70% true / 30% false (counts the
       five scenarios per cell — 4/5 have phone visible)
- [ ] `people` total: between 150 and 600 (1-4 people per frame)

After sign-off, **freeze the set** — `git tag benchmark-sprint15-v1` so
future sprints can still reproduce v1.0 numbers.
