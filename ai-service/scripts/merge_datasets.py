"""Dataset merger — PRD-021 §3 Sprint 14 (BL-262) + PRD-017 §8.1 + §9.

Combines multiple YOLO-format converted bundles under
``data/converted/<name>/`` into a single training corpus under
``data/merged/<output_name>/``. Three responsibilities:

1. **Class mapping** (PRD-017 §8.1) — apply a unified class_mapping.yaml
   to remap each source's class IDs onto the merged target list.
2. **Class imbalance** (PRD-017 §8.2) — random-undersample any class
   that exceeds ``--max-per-class``; drop classes with fewer than
   ``--min-per-class`` images.
3. **Stratified train/val/test split** (PRD-017 §9) — per-class shuffle
   so every split keeps the source class distribution. Guards against
   data leakage by ensuring an image never lands in two splits.

The class mapping file follows PRD-017 §8.1:

    target_classes:
      0: earbuds
      1: phone
      2: book
      3: paper_notes
    source_mappings:
      roboflow_earbuds:
        "airpods": 0
        "earbuds": 0
      coco_subset:
        "cell phone": 1

The source dataset directory name is used to look up the mapping (so
``data/converted/roboflow_earbuds/`` resolves to ``roboflow_earbuds``
under ``source_mappings``). Datasets without a sidecar mapping are
skipped with a warning.

Output layout matches PRD-017 §5.2:

    data/merged/<name>/
        data.yaml              — final class names + nc + split paths
        dataset_meta.json      — provenance (which sources + counts)
        images/{train,val,test}/*
        labels/{train,val,test}/*.txt

Usage:

    python -m scripts.merge_datasets \\
        --sources data/converted/roboflow_earbuds data/converted/coco_phone_book \\
        --class-map ai-service/configs/class_mapping.yaml \\
        --output   data/merged/v1_earbuds_phone \\
        --max-per-class 2000 --min-per-class 50 \\
        --split-ratio 0.7:0.2:0.1
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import shutil
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


# ──────────────────── class mapping ────────────────────

def _load_class_map(path: Path) -> tuple[dict[int, str], dict[str, dict[str, int]]]:
    """Return (target_classes_by_id, source_mappings) from the YAML."""
    import yaml as _yaml
    spec = _yaml.safe_load(path.read_text(encoding="utf-8"))
    raw_targets = spec.get("target_classes") or {}
    if isinstance(raw_targets, list):
        targets = {i: n for i, n in enumerate(raw_targets)}
    else:
        targets = {int(k): v for k, v in raw_targets.items()}
    sources = spec.get("source_mappings") or {}
    return targets, {k: {n: int(c) for n, c in v.items()} for k, v in sources.items()}


def _source_remap(source_dir: Path, source_mapping: dict[str, int]) -> dict[int, int]:
    """Build {original_class_id: target_class_id} by reading source data.yaml."""
    yaml_path = source_dir / "data.yaml"
    if not yaml_path.is_file():
        return {}
    import yaml as _yaml
    spec = _yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
    names = spec.get("names") or []
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names)]
    remap: dict[int, int] = {}
    for orig_id, orig_name in enumerate(names):
        target = source_mapping.get(orig_name)
        if target is not None:
            remap[orig_id] = target
    return remap


# ──────────────────── label IO ────────────────────

def _read_label_lines(label_path: Path) -> list[tuple[int, float, float, float, float]]:
    out: list[tuple[int, float, float, float, float]] = []
    for line in label_path.read_text(encoding="utf-8").splitlines():
        parts = line.strip().split()
        if len(parts) != 5:
            continue
        try:
            out.append((int(parts[0]),
                        float(parts[1]), float(parts[2]),
                        float(parts[3]), float(parts[4])))
        except ValueError:
            continue
    return out


def _write_label_lines(label_path: Path, lines: list[tuple[int, float, float, float, float]]) -> None:
    label_path.parent.mkdir(parents=True, exist_ok=True)
    label_path.write_text(
        "\n".join(f"{cls} {x:.6f} {y:.6f} {w:.6f} {h:.6f}" for cls, x, y, w, h in lines) + "\n",
        encoding="utf-8",
    )


# ──────────────────── core merge ────────────────────

def _is_negatives_bundle(src: Path) -> bool:
    """A negatives bundle has manifest.json with bundle_kind == 'negatives'."""
    manifest = src / "manifest.json"
    if not manifest.is_file():
        return False
    try:
        meta = json.loads(manifest.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return False
    return meta.get("bundle_kind") == "negatives"


def collect_negatives(src: Path) -> list[dict[str, Any]]:
    """Mine bundle: all images are negatives — empty label lines, no dominant
    class. The stratified split distributes them across train/val randomly."""
    out: list[dict[str, Any]] = []
    img_dir = src / "images"
    if not img_dir.is_dir():
        return out
    for img in sorted(img_dir.iterdir()):
        if img.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        out.append({
            "img_path":     img,
            "label_lines":  [],
            "dominant_cls": -1,        # sentinel: not bucketed by class
            "source":       src.name,
            "is_negative":  True,
        })
    return out


def collect_samples(
    sources: list[Path],
    source_mappings: dict[str, dict[str, int]],
) -> list[dict[str, Any]]:
    """Walk every source and yield {img_path, label_lines, dominant_cls, source}."""
    samples: list[dict[str, Any]] = []
    for src in sources:
        if not src.is_dir():
            log.warning("skip missing source: %s", src)
            continue

        # Negatives bundle short-circuit (PRD-017 §8.4 / BL-291)
        if _is_negatives_bundle(src):
            neg = collect_negatives(src)
            log.info("source '%s' is a negatives bundle → %d images", src.name, len(neg))
            samples.extend(neg)
            continue

        name = src.name
        source_map = source_mappings.get(name)
        if not source_map:
            log.warning("no class mapping for source '%s' — skipped", name)
            continue
        remap = _source_remap(src, source_map)
        if not remap:
            log.warning("source '%s' has no overlap with target classes — skipped", name)
            continue

        for split in ("train", "val", "test"):
            for img in (src / "images" / split).glob("*"):
                if img.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                    continue
                lbl = src / "labels" / split / f"{img.stem}.txt"
                if not lbl.is_file():
                    continue
                lines = _read_label_lines(lbl)
                remapped: list[tuple[int, float, float, float, float]] = []
                for cls, x, y, w, h in lines:
                    new_cls = remap.get(cls)
                    if new_cls is None:
                        continue
                    remapped.append((new_cls, x, y, w, h))
                if not remapped:
                    continue
                # Dominant class = largest bbox in the frame; used for stratified split + caps.
                dominant = max(remapped, key=lambda r: r[3] * r[4])[0]
                samples.append({
                    "img_path":     img,
                    "label_lines":  remapped,
                    "dominant_cls": dominant,
                    "source":       name,
                })
    return samples


NEGATIVES_CLS_ID = -1


def apply_class_caps(
    samples: list[dict[str, Any]],
    *,
    max_per_class: int | None,
    min_per_class: int,
    rng: random.Random,
) -> tuple[list[dict[str, Any]], dict[int, int]]:
    """Random undersample dominant classes above max; drop sparse classes.

    Negatives (dominant_cls == -1, PRD-017 §8.4) skip the min floor —
    they don't have a class to be sparse against — but still respect the
    max cap so a giant negatives bundle doesn't swamp training.
    """
    by_class: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for s in samples:
        by_class[s["dominant_cls"]].append(s)

    kept: list[dict[str, Any]] = []
    final_counts: dict[int, int] = {}
    for cls_id, group in by_class.items():
        is_negatives = cls_id == NEGATIVES_CLS_ID
        if not is_negatives and len(group) < min_per_class:
            log.warning("class %d has only %d images (<%d) — dropped",
                        cls_id, len(group), min_per_class)
            continue
        if max_per_class and len(group) > max_per_class:
            rng.shuffle(group)
            group = group[:max_per_class]
        final_counts[cls_id] = len(group)
        kept.extend(group)
    return kept, final_counts


def stratified_split(
    samples: list[dict[str, Any]],
    ratios: tuple[float, float, float],
    rng: random.Random,
) -> dict[str, list[dict[str, Any]]]:
    """Per-class shuffle → train/val/test buckets preserving class distribution."""
    train_r, val_r, _ = ratios
    by_class: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for s in samples:
        by_class[s["dominant_cls"]].append(s)

    out: dict[str, list[dict[str, Any]]] = {"train": [], "val": [], "test": []}
    for group in by_class.values():
        rng.shuffle(group)
        n = len(group)
        n_train = int(n * train_r)
        n_val   = int(n * val_r)
        out["train"].extend(group[:n_train])
        out["val"].extend(group[n_train:n_train + n_val])
        out["test"].extend(group[n_train + n_val:])
    return out


# ──────────────────── output writers ────────────────────

def write_splits(splits: dict[str, list[dict[str, Any]]], target: Path) -> dict[str, int]:
    """Copy images + write remapped labels to ``target/{images,labels}/<split>/``."""
    seen_stems: set[str] = set()
    counts: dict[str, int] = {}
    for split, group in splits.items():
        img_dir = target / "images" / split
        lbl_dir = target / "labels" / split
        img_dir.mkdir(parents=True, exist_ok=True)
        lbl_dir.mkdir(parents=True, exist_ok=True)
        n = 0
        for s in group:
            src: Path = s["img_path"]
            stem = src.stem
            # Guarantee uniqueness across sources (different folders, same stem).
            unique_stem = stem
            i = 1
            while unique_stem in seen_stems:
                unique_stem = f"{stem}_{i}"
                i += 1
            seen_stems.add(unique_stem)
            shutil.copy2(src, img_dir / f"{unique_stem}{src.suffix.lower()}")
            _write_label_lines(lbl_dir / f"{unique_stem}.txt", s["label_lines"])
            n += 1
        counts[split] = n
    return counts


def write_data_yaml(target: Path, targets: dict[int, str]) -> None:
    import yaml as _yaml
    names = {i: n for i, n in sorted(targets.items())}
    payload = {
        "path":  "./",
        "train": "images/train",
        "val":   "images/val",
        "test":  "images/test",
        "nc":    len(names),
        "names": names,
    }
    (target / "data.yaml").write_text(
        _yaml.safe_dump(payload, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


def write_meta(target: Path, payload: dict[str, Any]) -> None:
    meta = {"merged_at": datetime.now(timezone.utc).isoformat(), **payload}
    (target / "dataset_meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
    )


# ──────────────────── CLI ────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Merge YOLO datasets with class mapping + stratified split "
                    "(PRD-021 §3 Sprint 14 BL-262)"
    )
    parser.add_argument("--sources", nargs="+", required=True, type=Path,
                        help="Converted dataset directories")
    parser.add_argument("--class-map", required=True, type=Path,
                        help="YAML class mapping (PRD-017 §8.1)")
    parser.add_argument("--output", required=True, type=Path,
                        help="Merged output directory")
    parser.add_argument("--max-per-class", type=int, default=2000,
                        help="Undersample dominant class above this (0 = no cap)")
    parser.add_argument("--min-per-class", type=int, default=50,
                        help="Drop classes with fewer images than this")
    parser.add_argument("--split-ratio", default="0.7:0.2:0.1",
                        help="train:val:test ratios (must sum ~1.0)")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)

    ratios = tuple(float(x) for x in args.split_ratio.split(":"))
    if len(ratios) != 3 or abs(sum(ratios) - 1.0) > 1e-6:
        parser.error(f"--split-ratio must be three values summing to 1.0, got {args.split_ratio}")
    args.output.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)

    targets, source_mappings = _load_class_map(args.class_map)
    if not targets:
        parser.error("class map has no target_classes")

    samples = collect_samples(args.sources, source_mappings)
    log.info("collected %d candidate samples from %d sources",
             len(samples), len(args.sources))
    if not samples:
        parser.error("no samples survived class mapping — nothing to merge")

    capped, class_counts = apply_class_caps(
        samples,
        max_per_class=args.max_per_class or None,
        min_per_class=args.min_per_class,
        rng=rng,
    )
    log.info("after caps: %d samples, %d classes", len(capped), len(class_counts))

    splits = stratified_split(capped, ratios, rng)  # type: ignore[arg-type]
    counts = write_splits(splits, args.output)
    write_data_yaml(args.output, targets)
    write_meta(args.output, {
        "sources":        [str(s) for s in args.sources],
        "class_mapping":  str(args.class_map),
        "target_classes": {str(k): v for k, v in sorted(targets.items())},
        "class_counts":   {str(k): v for k, v in sorted(class_counts.items())},
        "split_counts":   counts,
        "split_ratio":    list(ratios),
        "max_per_class":  args.max_per_class,
        "min_per_class":  args.min_per_class,
        "seed":           args.seed,
        "total_images":   sum(counts.values()),
    })
    print(json.dumps({"output": str(args.output), "splits": counts,
                      "classes": class_counts}, indent=2))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(main())
