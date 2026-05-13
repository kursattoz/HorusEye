"""BL-291 mine_negatives — strip_into_negatives + CLI argparse cover.

The actual OID fetch needs FiftyOne; we exercise that manually. Here we
lock down the stripping logic (no bbox info leaks into negatives) and
the CLI's basic guards.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.mine_negatives import _strip_into_negatives, main


def test_strip_copies_images_and_emits_empty_labels(tmp_path: Path) -> None:
    # Build a fake YOLO-style source bundle
    src = tmp_path / "src"
    (src / "images").mkdir(parents=True)
    (src / "labels").mkdir(parents=True)
    for i in range(3):
        (src / "images" / f"img_{i}.jpg").write_bytes(b"fake")
        (src / "labels" / f"img_{i}.txt").write_text("0 0.5 0.5 0.1 0.1\n", encoding="utf-8")

    out = tmp_path / "neg"
    copied = _strip_into_negatives(source_root=src, output_root=out, source_tag="oid_test")
    assert copied == 3

    # Images carry the source_tag prefix
    img_names = sorted(p.name for p in (out / "images").iterdir())
    assert img_names == ["oid_test_img_0.jpg", "oid_test_img_1.jpg", "oid_test_img_2.jpg"]

    # All label files are EMPTY — no bbox info leaks into negatives
    for lbl in (out / "labels").iterdir():
        assert lbl.read_text(encoding="utf-8") == ""


def test_strip_ignores_label_files_in_source(tmp_path: Path) -> None:
    """A confused source layout with images under labels/ should not bleed."""
    src = tmp_path / "src"
    (src / "labels").mkdir(parents=True)
    (src / "labels" / "shouldnt_copy.jpg").write_bytes(b"fake")

    out = tmp_path / "neg"
    copied = _strip_into_negatives(source_root=src, output_root=out, source_tag="x")
    assert copied == 0


def test_cli_requires_output_dir(tmp_path: Path) -> None:
    with pytest.raises(SystemExit) as excinfo:
        main(["--output"])
    assert excinfo.value.code == 2


def test_cli_returns_nonzero_when_no_negatives_mined(tmp_path: Path) -> None:
    # Force zero caps → no work → exit 1
    rc = main([
        "--output",     str(tmp_path / "out"),
        "--pencil-max", "0",
        "--paper-max",  "0",
        "--pen-max",    "0",
        "--work-dir",   str(tmp_path / "scratch"),
    ])
    assert rc == 1
    # Manifest should still be written (zero-source case)
    manifest = json.loads((tmp_path / "out" / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["bundle_kind"] == "negatives"
    assert manifest["total_copied"] == 0
