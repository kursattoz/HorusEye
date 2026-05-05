"""Phone-detection benchmark — BL-193 (PRD-013 §7.2 son ¶).

Phase A deploy ön-koşulu: 150-frame benchmark seti üzerinde phone +
person detection precision/recall ölçümü. PRD-013 §7.2 kabul kriterleri:

    phone precision  > 0.80
    person recall    > 0.95

Kullanım:

    python -m scripts.benchmark_phone \\
        --data-dir test-data/phone_benchmark \\
        --ground-truth test-data/phone_benchmark/ground_truth.json \\
        --output build/benchmark_phone.json

Ground truth JSON formatı (örnek ``ground_truth.example.json`` ekli):

    {
      "frames": [
        {
          "filename": "lighting1_001.jpg",
          "lighting": "morning_sun",
          "people":   3,
          "phone_visible": true
        },
        ...
      ]
    }

Sonuç JSON:

    {
      "frames_evaluated": 150,
      "phone": {"precision": 0.84, "recall": 0.78, "f1": 0.81, "tp": 39, "fp": 7, "fn": 11},
      "person":{"precision": 0.97, "recall": 0.96, "f1": 0.96, "tp": 144, "fp": 4, "fn": 6},
      "by_lighting": {...}
    }

Bu rapor sonra ``ai_models.benchmark_results`` JSONB kolonuna yazılır
(Sprint 9 BL-9-07).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("benchmark_phone")


@dataclass
class GroundTruthFrame:
    filename:       str
    lighting:       str
    people:         int
    phone_visible:  bool


@dataclass
class ClassMetrics:
    tp: int = 0
    fp: int = 0
    fn: int = 0

    @property
    def precision(self) -> float:
        denom = self.tp + self.fp
        return self.tp / denom if denom else 0.0

    @property
    def recall(self) -> float:
        denom = self.tp + self.fn
        return self.tp / denom if denom else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) > 0 else 0.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "precision": round(self.precision, 4),
            "recall":    round(self.recall, 4),
            "f1":        round(self.f1, 4),
            "tp":        self.tp,
            "fp":        self.fp,
            "fn":        self.fn,
        }


@dataclass
class BenchmarkRun:
    phone:        ClassMetrics = field(default_factory=ClassMetrics)
    person:       ClassMetrics = field(default_factory=ClassMetrics)
    by_lighting:  dict[str, dict[str, ClassMetrics]] = field(default_factory=dict)

    def lighting_metrics(self, lighting: str, cls: str) -> ClassMetrics:
        return self.by_lighting.setdefault(lighting, {}).setdefault(cls, ClassMetrics())


# ───────── ground truth loading ─────────

def load_ground_truth(path: Path) -> list[GroundTruthFrame]:
    if not path.exists():
        raise SystemExit(f"ground truth not found: {path}")
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [GroundTruthFrame(**f) for f in raw["frames"]]


# ───────── inference + scoring ─────────

def evaluate_frame(
    detector: Any,
    frame_path: Path,
    truth: GroundTruthFrame,
    run: BenchmarkRun,
) -> None:
    import cv2  # type: ignore[import-untyped]

    bgr = cv2.imread(str(frame_path))
    if bgr is None:
        log.warning("could not decode %s — skipping", frame_path)
        return

    detections = detector.detect(bgr)

    has_phone_pred = any(d.class_name == "cell phone" for d in detections)
    person_count_pred = sum(1 for d in detections if d.class_name == "person")

    # phone class — binary present/absent
    p = run.phone
    p_l = run.lighting_metrics(truth.lighting, "phone")
    if has_phone_pred and truth.phone_visible:
        p.tp += 1; p_l.tp += 1
    elif has_phone_pred and not truth.phone_visible:
        p.fp += 1; p_l.fp += 1
    elif not has_phone_pred and truth.phone_visible:
        p.fn += 1; p_l.fn += 1

    # person — count-based scoring (each missed/extra is a separate FN/FP)
    pe = run.person
    pe_l = run.lighting_metrics(truth.lighting, "person")
    delta = person_count_pred - truth.people
    matched = min(person_count_pred, truth.people)
    pe.tp += matched; pe_l.tp += matched
    if delta > 0:
        pe.fp += delta; pe_l.fp += delta
    elif delta < 0:
        pe.fn += -delta; pe_l.fn += -delta


def run_benchmark(data_dir: Path, ground_truth_path: Path) -> dict[str, Any]:
    truths = load_ground_truth(ground_truth_path)

    from src.detection.yolo_detector import DetectorConfig, YoloDetector
    detector = YoloDetector(DetectorConfig(confidence_threshold=0.30, device="cpu"))
    detector.load()

    run = BenchmarkRun()
    evaluated = 0
    for truth in truths:
        frame_path = data_dir / truth.filename
        if not frame_path.exists():
            log.warning("missing frame: %s", frame_path)
            continue
        evaluate_frame(detector, frame_path, truth, run)
        evaluated += 1

    summary: dict[str, Any] = {
        "frames_evaluated": evaluated,
        "phone":  run.phone.as_dict(),
        "person": run.person.as_dict(),
        "by_lighting": {
            lighting: {cls: m.as_dict() for cls, m in cls_map.items()}
            for lighting, cls_map in run.by_lighting.items()
        },
        "thresholds": {
            "phone_precision_min": 0.80,
            "person_recall_min":   0.95,
        },
    }
    summary["pass"] = (
        run.phone.precision >= 0.80 and run.person.recall >= 0.95
    )
    return summary


# ───────── CLI ─────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir",     required=True, type=Path)
    parser.add_argument("--ground-truth", required=True, type=Path)
    parser.add_argument("--output",       required=False, type=Path)
    args = parser.parse_args(argv)

    summary = run_benchmark(args.data_dir, args.ground_truth)
    serialized = json.dumps(summary, indent=2, ensure_ascii=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding="utf-8")
        log.info("benchmark report → %s", args.output)
    print(serialized)
    return 0 if summary["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
