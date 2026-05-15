"""Preflight check — verify a training environment before a long run.

A v1.0 or v2.0 fine-tune takes hours and burns GPU hours we paid for.
Crashing 30 minutes in because ROBOFLOW_API_KEY was unset is the kind
of waste this script prevents. Run it before train_v1.sh / train_v2.sh.

Checks:

  - Required env vars set (ROBOFLOW_API_KEY, SUPABASE_*).
  - All training deps importable (roboflow, fiftyone, ultralytics, torch).
  - Torch sees the requested device (cpu / mps / cuda:N).
  - Disk has at least N GB free under ai-service/data/.
  - Output directory either doesn't exist or is empty (no accidental
    overwrite of a prior run).
  - Supabase service-role connection actually responds (cheap GET).

Exit codes:
  0 — all green
  1 — at least one HARD check failed (don't proceed with training)
  2 — soft warnings only (training will work; some optional feature won't)

Usage:
  python -m scripts.preflight_training
  python -m scripts.preflight_training --device cuda:0 --output runs/sprint15_v1 --min-disk-gb 30
"""

from __future__ import annotations

import argparse
import importlib
import os
import shutil
import sys
from pathlib import Path


HARD_DEPS = [
    ("ultralytics",  "ultralytics ≥8.3 — YOLOv8 training loop"),
    ("torch",        "PyTorch — needed for ultralytics + torchreid"),
    ("yaml",         "PyYAML — data.yaml + class_mapping.yaml IO"),
    ("PIL",          "Pillow — image read/write for filters + anonymize"),
]
OPTIONAL_DEPS = [
    ("roboflow",          "roboflow — Universe dataset fetch"),
    ("fiftyone",          "fiftyone — OID + COCO + LVIS + Objects365 zoo"),
    ("datasets",          "huggingface-datasets — MaskedFace-Net fetch"),
    ("open_clip",         "open-clip-torch — BL-277 in-ear filter (CLIP backend)"),
    ("scipy",             "scipy — BL-313 Hungarian matcher (falls back to greedy)"),
    ("torchreid",         "torchreid — BL-312 OSNet body embedder"),
]

HARD_ENV = [
    "ROBOFLOW_API_KEY",       # technically optional, but most flows need it
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
]


def _check_imports() -> tuple[list[str], list[str]]:
    errors:   list[str] = []
    warnings: list[str] = []
    for mod, desc in HARD_DEPS:
        try:
            importlib.import_module(mod)
        except ImportError:
            errors.append(f"[HARD] missing {mod} — {desc}")
    for mod, desc in OPTIONAL_DEPS:
        try:
            importlib.import_module(mod)
        except ImportError:
            warnings.append(f"[soft] missing {mod} — {desc}")
    return errors, warnings


def _check_env() -> list[str]:
    return [f"[HARD] env var unset: {k}" for k in HARD_ENV if not os.getenv(k)]


def _check_device(requested: str) -> tuple[list[str], list[str]]:
    """Verify torch sees the requested device."""
    errors:   list[str] = []
    warnings: list[str] = []
    try:
        import torch  # type: ignore[import-not-found]
    except ImportError:
        errors.append("[HARD] torch not importable; can't verify device")
        return errors, warnings

    if requested == "cpu":
        return errors, warnings    # always OK
    if requested == "mps":
        if not torch.backends.mps.is_available():
            errors.append("[HARD] requested mps but torch.backends.mps.is_available() == False")
    elif requested.startswith("cuda"):
        if not torch.cuda.is_available():
            errors.append("[HARD] requested cuda but torch.cuda.is_available() == False")
        else:
            try:
                idx = int(requested.split(":", 1)[1]) if ":" in requested else 0
                if idx >= torch.cuda.device_count():
                    errors.append(
                        f"[HARD] requested {requested} but only {torch.cuda.device_count()} CUDA devices visible",
                    )
            except ValueError:
                warnings.append(f"[soft] could not parse cuda index from {requested}")
    else:
        warnings.append(f"[soft] unrecognized device {requested} — ultralytics will try anyway")
    return errors, warnings


def _check_disk(path: Path, min_gb: float) -> list[str]:
    if not path.exists():
        path.mkdir(parents=True, exist_ok=True)
    stat = shutil.disk_usage(path)
    free_gb = stat.free / 1e9
    if free_gb < min_gb:
        return [f"[HARD] only {free_gb:.1f} GB free at {path}; need ≥ {min_gb:.0f} GB"]
    return []


def _check_output(output: Path) -> list[str]:
    if output.exists() and any(output.iterdir()):
        return [
            f"[HARD] output dir {output} is not empty — pass --force "
            "or delete it before training to avoid mixing checkpoints.",
        ]
    return []


def _check_supabase() -> list[str]:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        return []   # env check already flagged this
    try:
        import urllib.request
        req = urllib.request.Request(
            f"{url}/rest/v1/ai_models?select=id&limit=1",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status != 200:
                return [f"[HARD] Supabase REST returned {resp.status}; check SUPABASE_* vars"]
    except Exception as e:  # noqa: BLE001
        return [f"[HARD] Supabase REST ping failed: {e}"]
    return []


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Preflight check for training runs")
    parser.add_argument("--device",        default="cpu",
                        help="cpu | mps | cuda:N (must match the training --device flag)")
    parser.add_argument("--output",        type=Path, default=Path("runs/sprint15_v1"),
                        help="Run output dir (warns if non-empty)")
    parser.add_argument("--min-disk-gb",   type=float, default=30.0,
                        help="Min free GB under ai-service/data (default: 30)")
    parser.add_argument("--data-root",     type=Path, default=Path("data"),
                        help="Path where datasets get downloaded")
    parser.add_argument("--force",         action="store_true",
                        help="Don't fail if output dir is non-empty")
    parser.add_argument("--skip-supabase", action="store_true",
                        help="Skip Supabase REST ping (offline runs)")
    args = parser.parse_args(argv)

    errors:   list[str] = []
    warnings: list[str] = []

    # ── env ──
    errors.extend(_check_env())

    # ── imports ──
    e, w = _check_imports()
    errors.extend(e); warnings.extend(w)

    # ── device ──
    e, w = _check_device(args.device)
    errors.extend(e); warnings.extend(w)

    # ── disk ──
    errors.extend(_check_disk(args.data_root, args.min_disk_gb))

    # ── output ──
    if not args.force:
        errors.extend(_check_output(args.output))

    # ── supabase ──
    if not args.skip_supabase:
        errors.extend(_check_supabase())

    print("=" * 72)
    if errors:
        print("PREFLIGHT FAILED:")
        for e in errors:   print(f"  ✗ {e}")
    else:
        print("PREFLIGHT OK — proceed with training.")
    if warnings:
        print("\nWarnings (training will still run):")
        for w in warnings: print(f"  ! {w}")
    print("=" * 72)

    if errors:   return 1
    if warnings: return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
