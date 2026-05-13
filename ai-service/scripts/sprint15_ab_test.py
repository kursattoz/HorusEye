"""Sprint 15 (BL-284) — A/B compare stock YOLOv8n vs the v1.0 fine-tune.

Loads two benchmark JSON reports (BL-281 schema, produced by
``scripts.benchmark_phone`` per side), computes per-class +
per-lighting precision / recall / F1 deltas, and emits a Markdown
report + a JSON summary. Exits non-zero when v1.0 regresses
**below stock by more than --regression-tolerance** so CI / the
release operator can refuse to promote.

The two report files must come from the **same benchmark frame set**.
Different sets ≠ comparable; the script asserts ``frames_evaluated``
matches across the two.

Usage:

    python -m scripts.sprint15_ab_test \\
        --stock     build/benchmark_stock.json \\
        --candidate build/benchmark_sprint15_v1.json \\
        --markdown  build/ab_sprint15.md \\
        --summary   build/ab_sprint15.json
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


# ───────────────────── delta math ─────────────────────

def _safe_get(d: Any, *keys: str, default: float | None = None) -> float | None:
    for k in keys:
        if not isinstance(d, dict) or k not in d:
            return default
        d = d[k]
    return d if isinstance(d, (int, float)) else default


def compute_class_deltas(stock: dict[str, Any], cand: dict[str, Any]) -> dict[str, dict[str, float | None]]:
    """Per-class precision / recall / f1 deltas (candidate − stock)."""
    deltas: dict[str, dict[str, float | None]] = {}
    classes = sorted(set(stock.keys()) | set(cand.keys()))
    for cls in classes:
        if cls in {"frames_evaluated", "by_lighting"}:
            continue
        s = stock.get(cls, {}) if isinstance(stock.get(cls), dict) else {}
        c = cand.get(cls, {})  if isinstance(cand.get(cls), dict)  else {}
        deltas[cls] = {
            "precision_stock":     _safe_get(s, "precision"),
            "precision_candidate": _safe_get(c, "precision"),
            "precision_delta":     _delta(s, c, "precision"),
            "recall_stock":        _safe_get(s, "recall"),
            "recall_candidate":    _safe_get(c, "recall"),
            "recall_delta":        _delta(s, c, "recall"),
            "f1_stock":            _safe_get(s, "f1"),
            "f1_candidate":        _safe_get(c, "f1"),
            "f1_delta":            _delta(s, c, "f1"),
        }
    return deltas


def _delta(s: dict[str, Any], c: dict[str, Any], key: str) -> float | None:
    sv = _safe_get(s, key)
    cv = _safe_get(c, key)
    if sv is None or cv is None:
        return None
    return round(cv - sv, 4)


def compute_lighting_deltas(stock: dict[str, Any], cand: dict[str, Any]) -> dict[str, dict[str, float | None]]:
    """If both reports carry ``by_lighting``, emit per-lighting f1 delta."""
    s_by = stock.get("by_lighting") or {}
    c_by = cand.get("by_lighting")  or {}
    if not (isinstance(s_by, dict) and isinstance(c_by, dict)):
        return {}
    out: dict[str, dict[str, float | None]] = {}
    for lighting in sorted(set(s_by.keys()) | set(c_by.keys())):
        s_row = s_by.get(lighting, {}) if isinstance(s_by.get(lighting), dict) else {}
        c_row = c_by.get(lighting, {}) if isinstance(c_by.get(lighting), dict) else {}
        out[lighting] = {
            "f1_stock":     _safe_get(s_row, "phone", "f1"),
            "f1_candidate": _safe_get(c_row, "phone", "f1"),
            "f1_delta":     _delta(s_row.get("phone", {}), c_row.get("phone", {}), "f1"),
        }
    return out


def detect_regressions(
    class_deltas: dict[str, dict[str, float | None]],
    *,
    tolerance: float,
) -> list[str]:
    """Return human-readable regression messages worse than tolerance."""
    out: list[str] = []
    for cls, d in class_deltas.items():
        for metric in ("precision_delta", "recall_delta", "f1_delta"):
            value = d.get(metric)
            if value is not None and value < -tolerance:
                out.append(f"{cls}.{metric.replace('_delta','')}: {value:+.4f} (worse than -{tolerance})")
    return out


# ───────────────────── output rendering ─────────────────────

def render_markdown(
    *,
    stock_path:      Path,
    candidate_path:  Path,
    class_deltas:    dict[str, dict[str, float | None]],
    lighting_deltas: dict[str, dict[str, float | None]],
    regressions:     list[str],
    frames_evaluated: int,
) -> str:
    lines: list[str] = [
        "# Sprint 15 A/B — stock vs v1.0",
        "",
        f"- Frames evaluated: **{frames_evaluated}**",
        f"- Stock report:     `{stock_path}`",
        f"- Candidate report: `{candidate_path}`",
        "",
        "## Per-class deltas (candidate − stock)",
        "",
        "| Class | Δ precision | Δ recall | Δ F1 |",
        "|---|---:|---:|---:|",
    ]
    for cls, d in class_deltas.items():
        lines.append(
            f"| {cls} | {_fmt_delta(d['precision_delta'])} | "
            f"{_fmt_delta(d['recall_delta'])} | {_fmt_delta(d['f1_delta'])} |"
        )

    if lighting_deltas:
        lines += [
            "",
            "## Per-lighting phone F1 (candidate − stock)",
            "",
            "| Lighting | Δ F1 |",
            "|---|---:|",
        ]
        for lighting, d in lighting_deltas.items():
            lines.append(f"| {lighting} | {_fmt_delta(d['f1_delta'])} |")

    if regressions:
        lines += [
            "",
            "## ⚠️ Regressions worse than tolerance",
            "",
            *[f"- {r}" for r in regressions],
        ]
    else:
        lines += ["", "✓ No regressions worse than tolerance."]

    return "\n".join(lines) + "\n"


def _fmt_delta(v: float | None) -> str:
    if v is None:
        return "—"
    return f"{v:+.4f}"


# ───────────────────── CLI ─────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="A/B compare two benchmark_phone reports (BL-284)"
    )
    parser.add_argument("--stock",     required=True, type=Path,
                        help="benchmark_phone JSON for the stock model")
    parser.add_argument("--candidate", required=True, type=Path,
                        help="benchmark_phone JSON for the candidate (e.g. v1.0)")
    parser.add_argument("--markdown",  type=Path, help="Path to write the Markdown report")
    parser.add_argument("--summary",   type=Path, help="Path to write the JSON summary")
    parser.add_argument("--regression-tolerance", type=float, default=0.02,
                        help="Fail (exit 1) if candidate is worse by more than this on any metric (default: 0.02)")
    args = parser.parse_args(argv)

    if not args.stock.is_file():
        parser.error(f"stock report not found: {args.stock}")
    if not args.candidate.is_file():
        parser.error(f"candidate report not found: {args.candidate}")

    stock = json.loads(args.stock.read_text(encoding="utf-8"))
    cand  = json.loads(args.candidate.read_text(encoding="utf-8"))

    s_frames = stock.get("frames_evaluated", 0)
    c_frames = cand.get("frames_evaluated", 0)
    if s_frames != c_frames:
        parser.error(
            f"frames_evaluated mismatch: stock={s_frames}, candidate={c_frames}. "
            "Reports must come from the same benchmark frame set."
        )

    class_deltas    = compute_class_deltas(stock, cand)
    lighting_deltas = compute_lighting_deltas(stock, cand)
    regressions     = detect_regressions(class_deltas, tolerance=args.regression_tolerance)

    md = render_markdown(
        stock_path=args.stock,
        candidate_path=args.candidate,
        class_deltas=class_deltas,
        lighting_deltas=lighting_deltas,
        regressions=regressions,
        frames_evaluated=s_frames,
    )
    if args.markdown:
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.write_text(md, encoding="utf-8")

    summary = {
        "frames_evaluated": s_frames,
        "stock_path":       str(args.stock),
        "candidate_path":   str(args.candidate),
        "class_deltas":     class_deltas,
        "lighting_deltas":  lighting_deltas,
        "regressions":      regressions,
        "regression_tolerance": args.regression_tolerance,
        "passed":           len(regressions) == 0,
    }
    if args.summary:
        args.summary.parent.mkdir(parents=True, exist_ok=True)
        args.summary.write_text(json.dumps(summary, indent=2, ensure_ascii=False),
                                encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print(md)
    return 0 if summary["passed"] else 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(main())
