"""Preflight checks — env + disk + output coverage.

The Supabase ping + dep imports are skipped here (they touch the live
internet / heavy ML stack). We exercise the pure-logic checks: missing
env, non-empty output dir, low disk.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from scripts.preflight_training import (
    _check_disk, _check_env, _check_output,
)


# ───────── env ─────────

def test_check_env_flags_missing(monkeypatch) -> None:
    for k in ["ROBOFLOW_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]:
        monkeypatch.delenv(k, raising=False)
    errors = _check_env()
    assert len(errors) == 3
    assert all("env var unset" in e for e in errors)


def test_check_env_passes_when_set(monkeypatch) -> None:
    monkeypatch.setenv("ROBOFLOW_API_KEY", "x")
    monkeypatch.setenv("SUPABASE_URL", "https://example.com")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "x")
    assert _check_env() == []


# ───────── output ─────────

def test_check_output_clean_dir_passes(tmp_path: Path) -> None:
    assert _check_output(tmp_path / "fresh") == []


def test_check_output_existing_empty_passes(tmp_path: Path) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    assert _check_output(empty) == []


def test_check_output_existing_non_empty_fails(tmp_path: Path) -> None:
    busy = tmp_path / "busy"
    busy.mkdir()
    (busy / "old.pt").write_text("legacy", encoding="utf-8")
    errors = _check_output(busy)
    assert len(errors) == 1
    assert "not empty" in errors[0]


# ───────── disk ─────────

def test_check_disk_passes_when_enough_free(tmp_path: Path) -> None:
    # Disk under /tmp on a dev machine almost always has > 1 MB free.
    assert _check_disk(tmp_path, min_gb=0.001) == []


def test_check_disk_fails_when_below_threshold(tmp_path: Path) -> None:
    # Setting min_gb to an absurdly large value forces the check to fail
    # regardless of host capacity.
    errors = _check_disk(tmp_path, min_gb=1e9)   # 1 EB
    assert len(errors) == 1
    assert "GB free" in errors[0]
