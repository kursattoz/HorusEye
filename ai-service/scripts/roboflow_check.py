"""Roboflow Universe dataset checker — gates per docs/roboflow-workspace-setup.md.

Usage:
    python -m scripts.roboflow_check <workspace>/<project>[/<version>]

Examples:
    python -m scripts.roboflow_check mahmoud-mohamed-phhz1/cheat-detect
    python -m scripts.roboflow_check mahmoud-mohamed-phhz1/cheat-detect/40

Prints a verdict (PASS / REJECT) plus per-criterion detail so the
operator can decide before forking. Reads ROBOFLOW_API_KEY from .env.

Exit codes:
  0 — PASS
  1 — REJECT (one or more hard gates failed)
  2 — invalid input
"""

from __future__ import annotations

import os
import sys


HARD_REJECT_TYPES = {
    "instance-segmentation",   # produces polygons, not the bbox YOLO format we need
    "semantic-segmentation",
    "classification",
    "pose-estimation",
}
HARD_REJECT_ANNOTATIONS = {
    "pose",          # keypoint skeletons
    "classification",
    "segmentation",
}
SOFT_OK_TYPES = {
    "object-detection",
}
MIN_IMAGES_DEFAULT = 500
MIN_IMAGES_CHEAT   = 300        # softer floor for cheat-sheet-related sets


def _evaluate(proj, version_num: int | None) -> int:
    issues:   list[str] = []
    warnings: list[str] = []
    info: list[tuple[str, str]] = []

    proj_id  = getattr(proj, "id", None) or "<unknown>"
    name     = getattr(proj, "name", "?")
    p_type   = (getattr(proj, "type", "") or "").lower()
    p_annot  = (getattr(proj, "annotation", "") or "").lower()
    classes  = getattr(proj, "classes", None) or {}
    splits   = getattr(proj, "splits", None) or {}
    public   = getattr(proj, "public", None)
    license_ = getattr(proj, "license", None)

    info += [
        ("id",         proj_id),
        ("name",       name),
        ("type",       p_type or "—"),
        ("annotation", p_annot or "—"),
        ("public",     str(public)),
        ("license",    license_ or "(check Universe web page)"),
        ("classes",    ", ".join(sorted(classes.keys())) if classes else "—"),
        ("splits",     str(splits)),
    ]

    total_images = sum(int(v) for v in splits.values()) if splits else 0
    info.append(("total_imgs_in_splits", str(total_images)))

    # ── hard gates ──
    if p_type in HARD_REJECT_TYPES:
        issues.append(f"type '{p_type}' is not bbox object-detection")
    elif p_type and p_type not in SOFT_OK_TYPES:
        warnings.append(f"unfamiliar type '{p_type}' — manually verify it exports as bbox")

    if p_annot in HARD_REJECT_ANNOTATIONS:
        issues.append(f"annotation '{p_annot}' is not bbox")

    # Tighter floor unless project name hints cheat-sheet
    is_cheat = any(k in proj_id.lower() for k in ("cheat", "paper-notes", "hidden-notes"))
    min_images = MIN_IMAGES_CHEAT if is_cheat else MIN_IMAGES_DEFAULT
    if total_images > 0 and total_images < min_images:
        issues.append(f"total images {total_images} below floor {min_images}")

    if not classes:
        issues.append("no classes declared")
    else:
        # Heuristic: reject if all class names are behavior labels (cheating, normal)
        OBJ_HINTS = {
            "phone", "cell", "earbud", "airpod", "watch", "smartwatch",
            "book", "paper", "note", "cheat", "calculator", "pencil",
            "person", "hand", "face",
        }
        names_lower = " ".join(c.lower() for c in classes.keys())
        if not any(h in names_lower for h in OBJ_HINTS):
            warnings.append(f"class names look behavior-based ({list(classes.keys())}); confirm they're object bboxes")

    if version_num is not None:
        try:
            v = proj.version(version_num)
            v_type = (getattr(v, "type", "") or "").lower()
            if v_type in HARD_REJECT_TYPES:
                issues.append(f"version {version_num} type '{v_type}' is not bbox")
            info.append((f"v{version_num}_images", str(getattr(v, "images", "?"))))
        except Exception as e:  # noqa: BLE001
            warnings.append(f"version {version_num} fetch failed: {e}")

    # ── render ──
    width = max(len(k) for k, _ in info)
    print("=" * 72)
    print(f"Roboflow check: {proj_id}")
    print("=" * 72)
    for k, val in info:
        print(f"  {k:<{width}}  {val}")
    print()
    if issues:
        print("REJECT — hard gate(s) failed:")
        for i in issues:
            print(f"  ✗ {i}")
    else:
        print("PASS — looks usable.")
    if warnings:
        print()
        print("Warnings:")
        for w in warnings:
            print(f"  ! {w}")
    print("=" * 72)
    return 1 if issues else 0


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    target = argv[1]
    parts  = target.split("/")
    if len(parts) < 2:
        print(f"ERROR: expected <workspace>/<project>[/<version>], got '{target}'", file=sys.stderr)
        return 2
    workspace, project, *rest = parts
    version_num = int(rest[0]) if rest else None

    try:
        from roboflow import Roboflow
    except ImportError:
        print("ERROR: `pip install roboflow` first", file=sys.stderr)
        return 2

    api_key = os.environ.get("ROBOFLOW_API_KEY")
    if not api_key:
        print("ERROR: ROBOFLOW_API_KEY not set. `source ai-service/.env` first.", file=sys.stderr)
        return 2

    try:
        rf = Roboflow(api_key=api_key)
        proj = rf.workspace(workspace).project(project)
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: failed to load {workspace}/{project}: {e}", file=sys.stderr)
        return 2

    return _evaluate(proj, version_num)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
