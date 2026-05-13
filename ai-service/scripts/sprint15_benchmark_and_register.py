"""Sprint 15 (BL-283) — benchmark + ai_models registry runner.

Orchestrates the post-train step:

1. Run scripts.benchmark_phone on the frozen Sprint 15 benchmark set
   (BL-281) for the candidate weights → JSON report.
2. Upload best.pt to the ``ai-model-weights`` bucket.
3. Upsert an ``ai_models`` row carrying name + version + weights_path
   + benchmark_results.
4. Optionally flip ``ai_models.active`` so the AI service picks the new
   weights on next deploy.

Unlike scripts.finetune_yolo's --register flag (which runs at train
time), this runner can be invoked AFTER the model is benchmarked + QA'd
so a flaky training run never auto-promotes itself.

Usage:

    python -m scripts.sprint15_benchmark_and_register \\
        --weights      runs/sprint15_v1/weights/best.pt \\
        --benchmark-data test-data/phone_benchmark/sprint15_v1 \\
        --ground-truth   test-data/phone_benchmark/sprint15_v1/ground_truth.json \\
        --model-name     yolov8n-horuseye \\
        --model-version  v1.0.0-sprint15 \\
        --report-out     build/benchmark_sprint15_v1.json
        --activate                   # only after A/B sign-off (BL-284)
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[1]


def run_benchmark(
    *,
    weights:      Path,
    data_dir:     Path,
    ground_truth: Path,
    report_out:   Path,
) -> dict[str, Any]:
    """Shell out to scripts.benchmark_phone (BL-193). We don't import it
    directly because the script holds heavy ML imports that fail to load
    in environments without torch."""
    report_out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, "-m", "scripts.benchmark_phone",
        "--data-dir",     str(data_dir),
        "--ground-truth", str(ground_truth),
        "--weights",      str(weights),
        "--output",       str(report_out),
    ]
    log.info("→ benchmark: %s", " ".join(cmd))
    proc = subprocess.run(cmd, cwd=REPO_ROOT, check=False, capture_output=True, text=True)
    if proc.returncode != 0:
        log.error("benchmark_phone failed:\n%s", proc.stderr)
        raise SystemExit(proc.returncode)
    return json.loads(report_out.read_text(encoding="utf-8"))


def acceptance_gate(report: dict[str, Any]) -> tuple[bool, list[str]]:
    """PRD-013 §7.2 + PRD-021 Sprint 15 acceptance bar."""
    failures: list[str] = []
    phone = report.get("phone", {})
    person = report.get("person", {})
    if phone.get("precision", 0) < 0.85:
        failures.append(f"phone precision {phone.get('precision')} < 0.85")
    if person.get("recall", 0) < 0.95:
        failures.append(f"person recall {person.get('recall')} < 0.95")
    return (not failures), failures


def upload_and_register(
    *,
    weights:      Path,
    benchmark:    dict[str, Any],
    model_name:   str,
    model_version: str,
    bucket:       str,
    activate:     bool,
) -> dict[str, Any]:
    """Reuses BL-211 helpers — does NOT re-import benchmark_phone."""
    from scripts.finetune_yolo import upload_weights, register_ai_model

    object_key = f"{model_name}/{model_version}/best.pt"
    uri = upload_weights(weights, bucket, object_key)
    log.info("uploaded weights → %s", uri)

    row = register_ai_model(
        name=model_name,
        version=model_version,
        weights_path=uri,
        benchmark_results=benchmark,
        activate=activate,
    )
    log.info("ai_models row upserted (active=%s)", row.get("active"))
    return row


# ───────────────────────── CLI ─────────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Benchmark + register Sprint 15 weights (BL-283)"
    )
    parser.add_argument("--weights",        required=True, type=Path,
                        help="best.pt produced by sprint15_train_v1.sh")
    parser.add_argument("--benchmark-data", required=True, type=Path,
                        help="Directory of 150-frame benchmark JPGs (BL-281)")
    parser.add_argument("--ground-truth",   required=True, type=Path,
                        help="benchmark ground_truth.json")
    parser.add_argument("--report-out",     required=True, type=Path,
                        help="Write the benchmark JSON to this path")
    parser.add_argument("--model-name",     required=True)
    parser.add_argument("--model-version",  required=True)
    parser.add_argument("--bucket",         default="ai-model-weights")
    parser.add_argument("--activate",       action="store_true",
                        help="Flip ai_models.active on success (post A/B only)")
    parser.add_argument("--skip-gate",      action="store_true",
                        help="Register even when acceptance fails (audit only)")
    args = parser.parse_args(argv)

    if not args.weights.is_file():
        parser.error(f"weights file not found: {args.weights}")

    report = run_benchmark(
        weights=args.weights,
        data_dir=args.benchmark_data,
        ground_truth=args.ground_truth,
        report_out=args.report_out,
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))

    ok, failures = acceptance_gate(report)
    if not ok and not args.skip_gate:
        log.error("acceptance gate failed:")
        for f in failures:
            log.error("  %s", f)
        log.error("re-run with --skip-gate to register anyway.")
        return 1
    if not ok:
        log.warning("acceptance gate failed but --skip-gate set; registering anyway.")
        for f in failures:
            log.warning("  %s", f)

    row = upload_and_register(
        weights=args.weights,
        benchmark=report,
        model_name=args.model_name,
        model_version=args.model_version,
        bucket=args.bucket,
        activate=args.activate,
    )
    print(json.dumps({"ai_models": row, "acceptance": {"passed": ok, "failures": failures}},
                     indent=2, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(main())
