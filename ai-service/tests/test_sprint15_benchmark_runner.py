"""BL-283 — acceptance_gate logic + CLI argparse cover.

The benchmark + upload path needs torch + Supabase service-role + an
actual 150-frame JPG set; we exercise that end-to-end in the manual
runbook. Here we lock down the small but critical bits:

  - acceptance_gate fires on the right precision/recall thresholds
  - CLI rejects a missing weights file early (no expensive call)
"""

from __future__ import annotations

from pathlib import Path

import pytest

from scripts.sprint15_benchmark_and_register import acceptance_gate, main


# ───────── acceptance_gate ─────────

def test_acceptance_gate_passes_when_thresholds_met() -> None:
    ok, failures = acceptance_gate({
        "phone":  {"precision": 0.87, "recall": 0.80},
        "person": {"precision": 0.98, "recall": 0.96},
    })
    assert ok is True
    assert failures == []


def test_acceptance_gate_flags_phone_precision() -> None:
    ok, failures = acceptance_gate({
        "phone":  {"precision": 0.70, "recall": 0.80},
        "person": {"precision": 0.98, "recall": 0.96},
    })
    assert ok is False
    assert len(failures) == 1
    assert "phone precision 0.7" in failures[0]


def test_acceptance_gate_flags_person_recall() -> None:
    ok, failures = acceptance_gate({
        "phone":  {"precision": 0.90, "recall": 0.90},
        "person": {"precision": 0.99, "recall": 0.90},
    })
    assert ok is False
    assert len(failures) == 1
    assert "person recall 0.9" in failures[0]


def test_acceptance_gate_handles_missing_keys() -> None:
    ok, failures = acceptance_gate({})
    assert ok is False
    assert len(failures) == 2


# ───────── CLI ─────────

def test_cli_rejects_missing_weights(tmp_path: Path) -> None:
    with pytest.raises(SystemExit) as excinfo:
        main([
            "--weights",        str(tmp_path / "nope.pt"),
            "--benchmark-data", str(tmp_path),
            "--ground-truth",   str(tmp_path / "gt.json"),
            "--report-out",     str(tmp_path / "report.json"),
            "--model-name",     "yolov8n-horuseye",
            "--model-version",  "v1.0.0",
        ])
    # argparse.error() → exit code 2
    assert excinfo.value.code == 2
