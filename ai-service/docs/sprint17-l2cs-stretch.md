# Sprint 17 — L2CS-Net Gaze Fallback (BL-309, STRETCH)

**Status:** stretch goal. Defer until the geometric gaze rules
(BL-306 gaze_at_lap, BL-307 gaze_at_neighbor) report < 0.65 precision
after a full week of soak in staging.

PRD-021 §3 Sprint 17. The default Sprint 17 gaze rules use MediaPipe
Face Mesh yaw (BL-149) — robust for lateral peeking but coarse for
near-eye direction (gaze vs head turn). L2CS-Net (CVPR 2022) predicts
**eye-only** pitch/yaw from a 224×224 face crop; useful for the rare
edge case where the head is centered but the eyes are clearly tracking
sideways.

## Why we don't ship it now

- The geometric rules already cover the dominant cheating poses.
- L2CS-Net adds ~40 ms per face per frame on CPU (~7 ms on T4 GPU);
  PRD-013 §12.1 budget doesn't have headroom for it on the current
  Fargate sizing.
- The 0.65 precision floor (set in
  `sprint17-external-only-workflow.md`) hasn't been validated yet —
  L2CS-Net may be unnecessary.

## When to revisit

After Sprint 17 v3.0 ships and we have 2 weeks of post-decision data:

1. Pull per-rule precision from `/api/ai-models/metrics` (BL-208) for
   `gaze_at_neighbor`. If precision ≥ 0.65, skip L2CS-Net entirely.
2. If precision < 0.65 AND most false positives have the same root
   cause (head centered + eyes sideways), implement L2CS-Net as a
   second-pass refiner — only invoked when the geometric rule trips,
   never on every frame.

## Implementation sketch (when needed)

```python
# src/detection/gaze_l2cs.py — sketch, not implemented yet.
class L2csGazeRefiner:
    """Loads L2CS-Net ResNet-50 backbone once, runs eye-only gaze on
    confirmed face_mesh ROIs. Returns (pitch_deg, yaw_deg)."""

    def __init__(self, weights: Path):
        import torch
        # Load checkpoint, eval mode
        ...

    def refine(self, face_roi_bgr) -> tuple[float, float]:
        # 224×224 resize + normalize, single forward pass
        ...
```

Wire it into `gaze_at_neighbor.evaluate` behind a feature flag
(`L2CS_REFINER_ENABLED` env var). When the flag is on AND the
geometric rule trips, run L2CS once on the same frame; if its
yaw/pitch contradicts the geometric finding, suppress the incident.

## Don't merge without

- A real 0.65 precision deficit on `gaze_at_neighbor`.
- Updated Fargate sizing (L2CS-Net ResNet-50 needs ~1 GB weights
  resident).
- A second benchmark set tagged `benchmark-gaze-v1` so we can
  re-validate.

Until then, this doc is the bookmark.
