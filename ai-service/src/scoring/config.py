"""Scoring config loader — BL-188.

Reads ``config.yaml`` once at import time and exposes typed config objects
for each rule. Environment variables of the matching name override the
YAML value at load time, so ops can tune thresholds via SSM without
shipping a new image.

Override names are documented inline in ``config.yaml`` next to each knob.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import yaml

from src.scoring.rules.phone_in_hand import PhoneInHandConfig

log = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[2] / "config.yaml"


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        log.warning("config.yaml not found at %s — using built-in defaults", path)
        return {}
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, dict):
        log.warning("config.yaml top-level is not a mapping — ignoring")
        return {}
    return data


def _env_float(name: str, fallback: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return fallback
    try:
        return float(raw)
    except ValueError:
        log.warning("env %s=%r is not a float — using %.3f", name, raw, fallback)
        return fallback


def load_phone_in_hand_config(path: Path = DEFAULT_CONFIG_PATH) -> PhoneInHandConfig:
    """Build a :class:`PhoneInHandConfig` from YAML + env overrides."""
    data = _load_yaml(path)
    block = (data.get("scoring") or {}).get("phone_in_hand") or {}
    defaults = PhoneInHandConfig()
    return PhoneInHandConfig(
        overlap_threshold=_env_float(
            "PHONE_OVERLAP_THRESHOLD",
            float(block.get("overlap_threshold", defaults.overlap_threshold)),
        ),
        sustained_seconds=_env_float(
            "PHONE_DWELL_SECONDS",
            float(block.get("sustained_seconds", defaults.sustained_seconds)),
        ),
        cooldown_seconds=_env_float(
            "PHONE_COOLDOWN_SECONDS",
            float(block.get("cooldown_seconds", defaults.cooldown_seconds)),
        ),
        high_severity_conf=_env_float(
            "PHONE_HIGH_CONF",
            float(block.get("high_severity_conf", defaults.high_severity_conf)),
        ),
        medium_severity_conf=_env_float(
            "PHONE_MEDIUM_CONF",
            float(block.get("medium_severity_conf", defaults.medium_severity_conf)),
        ),
    )


# Process-wide singletons; rules import these directly.
PHONE_IN_HAND_CONFIG = load_phone_in_hand_config()
