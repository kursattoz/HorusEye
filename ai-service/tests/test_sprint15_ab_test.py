"""BL-284 A/B harness — delta math + regression detection + frame-count check.

Drives the comparator end-to-end against synthetic benchmark JSON files
so we don't need real model runs to lock down the contract.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.sprint15_ab_test import (
    compute_class_deltas,
    compute_lighting_deltas,
    detect_regressions,
    main,
)


# ───────── delta math ─────────

STOCK = {
    "frames_evaluated": 150,
    "phone":  {"precision": 0.80, "recall": 0.75, "f1": 0.77},
    "person": {"precision": 0.97, "recall": 0.96, "f1": 0.96},
    "by_lighting": {
        "morning_sun": {"phone": {"f1": 0.82}},
        "night":       {"phone": {"f1": 0.65}},
    },
}
CANDIDATE = {
    "frames_evaluated": 150,
    "phone":  {"precision": 0.88, "recall": 0.82, "f1": 0.85},   # better
    "person": {"precision": 0.97, "recall": 0.94, "f1": 0.95},   # recall down 0.02
    "by_lighting": {
        "morning_sun": {"phone": {"f1": 0.88}},
        "night":       {"phone": {"f1": 0.72}},
    },
}


def test_class_deltas_compute_correctly() -> None:
    d = compute_class_deltas(STOCK, CANDIDATE)
    assert pytest.approx(d["phone"]["precision_delta"]) == 0.08
    assert pytest.approx(d["phone"]["recall_delta"])    == 0.07
    assert pytest.approx(d["phone"]["f1_delta"])        == 0.08
    assert pytest.approx(d["person"]["recall_delta"])   == -0.02


def test_lighting_deltas_compute_correctly() -> None:
    d = compute_lighting_deltas(STOCK, CANDIDATE)
    assert pytest.approx(d["morning_sun"]["f1_delta"]) == 0.06
    assert pytest.approx(d["night"]["f1_delta"])       == 0.07


def test_regressions_below_tolerance_are_ignored() -> None:
    d = compute_class_deltas(STOCK, CANDIDATE)
    # person.recall regressed by exactly 0.02; tolerance 0.02 → no fail.
    regressions = detect_regressions(d, tolerance=0.02)
    assert regressions == []


def test_regressions_over_tolerance_are_flagged() -> None:
    stock = {**STOCK, "phone": {"precision": 0.90, "recall": 0.90, "f1": 0.90}}
    cand  = {**CANDIDATE, "phone": {"precision": 0.85, "recall": 0.86, "f1": 0.85}}
    d = compute_class_deltas(stock, cand)
    regressions = detect_regressions(d, tolerance=0.02)
    assert any("phone.precision" in r for r in regressions)
    assert any("phone.f1"        in r for r in regressions)


# ───────── CLI ─────────

def test_cli_emits_summary_and_exits_zero_on_clean_run(tmp_path: Path) -> None:
    stock = tmp_path / "stock.json"
    cand  = tmp_path / "cand.json"
    summary = tmp_path / "summary.json"
    md      = tmp_path / "ab.md"
    stock.write_text(json.dumps(STOCK), encoding="utf-8")
    cand.write_text(json.dumps(CANDIDATE), encoding="utf-8")

    rc = main([
        "--stock",     str(stock),
        "--candidate", str(cand),
        "--summary",   str(summary),
        "--markdown",  str(md),
        "--regression-tolerance", "0.02",
    ])
    assert rc == 0
    data = json.loads(summary.read_text(encoding="utf-8"))
    assert data["passed"] is True
    assert data["frames_evaluated"] == 150
    md_text = md.read_text(encoding="utf-8")
    assert "Per-class deltas" in md_text
    assert "+0.0800" in md_text  # phone precision delta


def test_cli_rejects_mismatched_frame_counts(tmp_path: Path) -> None:
    stock = tmp_path / "stock.json"
    cand  = tmp_path / "cand.json"
    stock.write_text(json.dumps({**STOCK, "frames_evaluated": 150}), encoding="utf-8")
    cand.write_text(json.dumps({**CANDIDATE, "frames_evaluated": 75}), encoding="utf-8")

    with pytest.raises(SystemExit) as excinfo:
        main(["--stock", str(stock), "--candidate", str(cand)])
    assert excinfo.value.code == 2  # argparse.error()


def test_cli_exits_one_on_regression(tmp_path: Path) -> None:
    stock = tmp_path / "stock.json"
    cand  = tmp_path / "cand.json"
    # Bigger phone F1 regression than tolerance.
    stock.write_text(json.dumps({
        "frames_evaluated": 150,
        "phone":  {"precision": 0.90, "recall": 0.90, "f1": 0.90},
        "person": {"precision": 0.97, "recall": 0.96, "f1": 0.96},
    }), encoding="utf-8")
    cand.write_text(json.dumps({
        "frames_evaluated": 150,
        "phone":  {"precision": 0.50, "recall": 0.50, "f1": 0.50},
        "person": {"precision": 0.97, "recall": 0.96, "f1": 0.96},
    }), encoding="utf-8")

    rc = main([
        "--stock", str(stock), "--candidate", str(cand),
        "--regression-tolerance", "0.02",
    ])
    assert rc == 1
