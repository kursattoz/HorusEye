"""Scoring config loader tests — BL-188."""

from __future__ import annotations

from pathlib import Path

import pytest

from src.scoring.config import (
    load_gaze_diversion_config,
    load_head_turn_config,
    load_phone_in_hand_config,
)
from src.scoring.rules.gaze_diversion import GazeDiversionConfig
from src.scoring.rules.head_turn import HeadTurnConfig
from src.scoring.rules.phone_in_hand import PhoneInHandConfig


def _write_yaml(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "config.yaml"
    path.write_text(body, encoding="utf-8")
    return path


def test_loads_yaml_values(tmp_path) -> None:
    path = _write_yaml(tmp_path, """
scoring:
  phone_in_hand:
    overlap_threshold: 0.42
    sustained_seconds: 5.5
    cooldown_seconds: 60.0
    high_severity_conf: 0.80
    medium_severity_conf: 0.55
""")
    cfg = load_phone_in_hand_config(path)
    assert cfg.overlap_threshold == 0.42
    assert cfg.sustained_seconds == 5.5
    assert cfg.cooldown_seconds == 60.0
    assert cfg.high_severity_conf == 0.80
    assert cfg.medium_severity_conf == 0.55


def test_env_override_wins_over_yaml(tmp_path, monkeypatch) -> None:
    path = _write_yaml(tmp_path, """
scoring:
  phone_in_hand:
    sustained_seconds: 3.0
""")
    monkeypatch.setenv("PHONE_DWELL_SECONDS", "7.5")
    cfg = load_phone_in_hand_config(path)
    assert cfg.sustained_seconds == 7.5


def test_missing_file_falls_back_to_defaults(tmp_path) -> None:
    path = tmp_path / "does-not-exist.yaml"
    cfg = load_phone_in_hand_config(path)
    defaults = PhoneInHandConfig()
    assert cfg == defaults


def test_partial_yaml_keeps_defaults_for_missing_keys(tmp_path) -> None:
    path = _write_yaml(tmp_path, """
scoring:
  phone_in_hand:
    sustained_seconds: 4.0
""")
    cfg = load_phone_in_hand_config(path)
    defaults = PhoneInHandConfig()
    assert cfg.sustained_seconds == 4.0
    assert cfg.overlap_threshold == defaults.overlap_threshold
    assert cfg.cooldown_seconds == defaults.cooldown_seconds


def test_invalid_env_value_falls_back_to_yaml(tmp_path, monkeypatch) -> None:
    path = _write_yaml(tmp_path, """
scoring:
  phone_in_hand:
    sustained_seconds: 3.5
""")
    monkeypatch.setenv("PHONE_DWELL_SECONDS", "not-a-number")
    cfg = load_phone_in_hand_config(path)
    assert cfg.sustained_seconds == 3.5


def test_empty_yaml_uses_defaults(tmp_path) -> None:
    path = _write_yaml(tmp_path, "")
    cfg = load_phone_in_hand_config(path)
    assert cfg == PhoneInHandConfig()


# ───────── BL-201 gaze + head_turn loaders ─────────

def test_gaze_diversion_yaml_values(tmp_path) -> None:
    path = _write_yaml(tmp_path, """
scoring:
  gaze_diversion:
    yaw_threshold: 25.0
    sustained_seconds: 4.5
    fires_for_medium: 4
    fires_for_high: 8
""")
    cfg = load_gaze_diversion_config(path)
    assert cfg.yaw_threshold == 25.0
    assert cfg.sustained_seconds == 4.5
    assert cfg.fires_for_medium == 4
    assert cfg.fires_for_high == 8


def test_gaze_diversion_env_override(tmp_path, monkeypatch) -> None:
    path = _write_yaml(tmp_path, "scoring: { gaze_diversion: { yaw_threshold: 30.0 } }")
    monkeypatch.setenv("YAW_THRESHOLD", "20.5")
    monkeypatch.setenv("GAZE_FIRES_FOR_HIGH", "10")
    cfg = load_gaze_diversion_config(path)
    assert cfg.yaw_threshold == 20.5
    assert cfg.fires_for_high == 10


def test_gaze_diversion_missing_file_uses_defaults(tmp_path) -> None:
    cfg = load_gaze_diversion_config(tmp_path / "nope.yaml")
    assert cfg == GazeDiversionConfig()


def test_head_turn_yaml_values(tmp_path) -> None:
    path = _write_yaml(tmp_path, """
scoring:
  head_turn:
    yaw_threshold: 50.0
    sustained_seconds: 1.5
    fires_for_combo: 4
""")
    cfg = load_head_turn_config(path)
    assert cfg.yaw_threshold == 50.0
    assert cfg.sustained_seconds == 1.5
    assert cfg.fires_for_combo == 4


def test_head_turn_env_override(tmp_path, monkeypatch) -> None:
    path = _write_yaml(tmp_path, "scoring: { head_turn: { cooldown_seconds: 30.0 } }")
    monkeypatch.setenv("HEAD_TURN_COOLDOWN_S", "120.0")
    cfg = load_head_turn_config(path)
    assert cfg.cooldown_seconds == 120.0


def test_head_turn_missing_file_uses_defaults(tmp_path) -> None:
    cfg = load_head_turn_config(tmp_path / "nope.yaml")
    assert cfg == HeadTurnConfig()


def test_invalid_int_env_falls_back(tmp_path, monkeypatch) -> None:
    path = _write_yaml(tmp_path, "scoring: { gaze_diversion: { fires_for_medium: 3 } }")
    monkeypatch.setenv("GAZE_FIRES_FOR_MEDIUM", "not-a-number")
    cfg = load_gaze_diversion_config(path)
    assert cfg.fires_for_medium == 3
