"""Dataset pipeline E2E — PRD-021 §3 Sprint 14 (BL-268).

Walks the full local pipeline against a synthetic 100-frame YOLO-format
bundle:

    convert_dataset.py  (passthrough)
        → validate_dataset.py  (writes quality_report.json)
            → merge_datasets.py (class mapping + stratified split)
                → exports/<name>.zip (zip the final corpus)

No external services (Roboflow / FiftyOne / Supabase) — the import step
is bypassed because BL-259 already covers it under
test_finetune_yolo_registry. This test guards against pipeline-level
regressions where a step's output stops matching the next step's
contract.

Total runtime budget: < 5 s (per-image is solid-color 64×64 jpg).
"""

from __future__ import annotations

import io
import json
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

REPO_ROOT  = Path(__file__).resolve().parents[1]
SCRIPTS    = REPO_ROOT / "scripts"


# ───────── synthetic dataset builder ─────────

def _make_synthetic_yolo_bundle(root: Path, *, num_images: int = 100) -> Path:
    """Build a Roboflow-style YOLO dataset bundle (what `import_dataset.py`
    via FiftyOne produces). Layout::

        root/
            data.yaml
            train/
                images/img_{N}.jpg
                labels/img_{N}.txt
    """
    from PIL import Image

    img_dir = root / "train" / "images"
    lbl_dir = root / "train" / "labels"
    img_dir.mkdir(parents=True, exist_ok=True)
    lbl_dir.mkdir(parents=True, exist_ok=True)

    for i in range(num_images):
        # Slight per-image color jitter so the perceptual-hash dedupe
        # scan does not collapse every frame into one duplicate group.
        base = (200, 50, 50) if i % 2 == 0 else (50, 50, 200)
        color = (
            min(255, base[0] + (i % 17)),
            min(255, base[1] + (i % 13)),
            min(255, base[2] + (i % 11)),
        )
        img = Image.new("RGB", (640, 640), color)
        img_path = img_dir / f"img_{i:03d}.jpg"
        img.save(img_path, "JPEG", quality=85)

        # Class 0 (earbuds) on even index, class 1 (phone) on odd index.
        # YOLO label format: cls cx cy w h (all 0..1 normalized).
        cls = i % 2
        (lbl_dir / f"img_{i:03d}.txt").write_text(
            f"{cls} 0.50 0.50 0.30 0.30\n", encoding="utf-8"
        )

    (root / "data.yaml").write_text(
        "path: ./\n"
        "train: train/images\n"
        "nc: 2\n"
        "names:\n"
        "  0: earbuds\n"
        "  1: phone\n",
        encoding="utf-8",
    )
    return root


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    """Run a script through `python -m scripts.<name>` from REPO_ROOT."""
    cmd = [sys.executable, "-m", *args]
    return subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


# ───────── fixtures ─────────

@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    """data/ workdir mirror, scoped to the test."""
    (tmp_path / "raw").mkdir()
    (tmp_path / "converted").mkdir()
    (tmp_path / "merged").mkdir()
    (tmp_path / "exports").mkdir()
    return tmp_path


# ───────── e2e ─────────

def test_dataset_pipeline_100_frame_dummy(workspace: Path) -> None:
    pytest.importorskip("PIL")
    pytest.importorskip("yaml")

    # ── 1. Build the synthetic raw bundle (stand-in for import_dataset.py).
    raw_source_a = workspace / "raw" / "roboflow_earbuds"
    raw_source_b = workspace / "raw" / "coco_subset"
    _make_synthetic_yolo_bundle(raw_source_a, num_images=60)
    _make_synthetic_yolo_bundle(raw_source_b, num_images=40)

    # ── 2. Convert (passthrough YOLO format → YOLO format).
    converted_a = workspace / "converted" / "roboflow_earbuds"
    res = _run(
        "scripts.convert_dataset",
        "--source",     str(raw_source_a),
        "--target",     str(converted_a),
        "--format",     "yolov8",
        "--class-map",  json.dumps({"earbuds": 0, "phone": 1}),
    )
    assert res.returncode == 0, f"convert failed: {res.stderr}"
    assert (converted_a / "data.yaml").is_file()
    assert any((converted_a / "images" / "train").iterdir())

    converted_b = workspace / "converted" / "coco_subset"
    res = _run(
        "scripts.convert_dataset",
        "--source",     str(raw_source_b),
        "--target",     str(converted_b),
        "--format",     "yolov8",
        "--class-map",  json.dumps({"earbuds": 0, "phone": 1}),
    )
    assert res.returncode == 0, f"convert (b) failed: {res.stderr}"

    # ── 3. Validate. quality_report.json should be a valid PRD-017 §6.3 doc.
    report_path = converted_a / "quality_report.json"
    res = _run(
        "scripts.validate_dataset",
        "--path", str(converted_a),
        "--no-duplicates",  # 64x64 solid colors collide intentionally
        "--output-report", str(report_path),
        "--min-resolution", "100",  # synthetic frames are 640x640
    )
    assert res.returncode == 0, f"validate failed: {res.stderr}"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    for k in ("dataset_path", "total_images", "total_annotations",
              "issues", "after_cleanup"):
        assert k in report, f"quality_report missing key: {k}"
    assert report["total_images"] == 60
    # Every label is well-formed and bbox is fine — passes cleanup.
    assert report["after_cleanup"]["total_annotations"] >= 50

    # ── 4. Merge two sources with a class_mapping.yaml.
    mapping_path = workspace / "class_mapping.yaml"
    mapping_path.write_text(
        "target_classes:\n"
        "  0: earbuds\n"
        "  1: phone\n"
        "source_mappings:\n"
        "  roboflow_earbuds:\n"
        "    \"earbuds\": 0\n"
        "    \"phone\":   1\n"
        "  coco_subset:\n"
        "    \"earbuds\": 0\n"
        "    \"phone\":   1\n",
        encoding="utf-8",
    )

    merged = workspace / "merged" / "v1_earbuds_phone"
    res = _run(
        "scripts.merge_datasets",
        "--sources",       str(converted_a), str(converted_b),
        "--class-map",     str(mapping_path),
        "--output",        str(merged),
        "--max-per-class", "200",
        "--min-per-class", "5",
        "--split-ratio",   "0.7:0.2:0.1",
        "--seed",          "1234",
    )
    assert res.returncode == 0, f"merge failed: {res.stderr}\n{res.stdout}"
    meta = json.loads((merged / "dataset_meta.json").read_text(encoding="utf-8"))
    assert meta["total_images"] >= 80
    assert set(meta["split_counts"].keys()) == {"train", "val", "test"}
    # Every split should have some samples (stratified, two classes).
    for split, n in meta["split_counts"].items():
        assert n > 0, f"empty split: {split}"
    # data.yaml should mirror the merged class list.
    import yaml as _yaml
    data_yaml = _yaml.safe_load((merged / "data.yaml").read_text(encoding="utf-8"))
    assert data_yaml["nc"] == 2
    assert data_yaml["names"][0] == "earbuds"
    assert data_yaml["names"][1] == "phone"

    # ── 5. Export — package the final corpus as a zip (stand-in for the
    #       /api/ai/datasets/[id]/export signed URL path).
    export_path = workspace / "exports" / "v1_earbuds_phone.zip"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in merged.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(merged))
    export_path.write_bytes(buf.getvalue())
    assert export_path.stat().st_size > 0

    # Sanity: zip carries data.yaml + at least one labelled image.
    with zipfile.ZipFile(export_path) as zf:
        names = zf.namelist()
        assert "data.yaml" in names
        assert any(n.startswith("images/train/") and n.endswith(".jpg") for n in names)
        assert any(n.startswith("labels/train/") and n.endswith(".txt") for n in names)
