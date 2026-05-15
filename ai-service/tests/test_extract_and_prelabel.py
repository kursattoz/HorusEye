"""BL-288 extract_and_prelabel — CLI argument + blank-label fallback.

We don't run ffmpeg / ultralytics in CI (heavy); the happy-path frame
extraction is exercised manually. Here we lock down the arg surface and
the blank-label fallback that doesn't need any optional deps.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from scripts.extract_and_prelabel import main, write_empty_labels


def test_cli_rejects_missing_video(tmp_path: Path) -> None:
    with pytest.raises(SystemExit) as excinfo:
        main([
            "--video",  str(tmp_path / "nope.mp4"),
            "--output", str(tmp_path / "out"),
        ])
    assert excinfo.value.code == 2  # argparse.error()


def test_write_empty_labels_creates_one_per_frame(tmp_path: Path) -> None:
    fake_frames = [tmp_path / "f1.jpg", tmp_path / "f2.jpg", tmp_path / "f3.jpg"]
    for f in fake_frames:
        f.write_bytes(b"")
    out = tmp_path / "out"
    out.mkdir()
    write_empty_labels(fake_frames, out)
    labels = sorted((out / "labels").iterdir())
    assert [p.name for p in labels] == ["f1.txt", "f2.txt", "f3.txt"]
    for p in labels:
        assert p.read_text(encoding="utf-8") == ""
