"""Face anonymizer — PRD-021 §3 Sprint 14 (BL-263) + PRD-017 §18.3.

Gaussian-blurs every face in an evidence frame so we can copy the
result into the training corpus without storing recognizable student
biometrics. PRD-017 §18.3 explains why this is mandatory for any
internal/positives or internal/negatives sample that originates from a
real exam: KVKK §6 requires data minimization, and YOLOv8 bbox training
does not need facial features for phone / earbuds / book / paper_notes
classes.

Face detection backends (auto-pick by availability):
  1. ``opencv`` (default) — cv2.CascadeClassifier with the bundled
     haarcascade_frontalface_default.xml. Zero extra deps; good enough
     for frontal portrait crops typical of classroom cameras.
  2. ``mediapipe`` — google-mediapipe Face Detection (short-range or
     full-range). Better at angled / partial occlusions; opt-in via
     ``--backend mediapipe``.

Operates on either a single image (``--input file.jpg``) or a directory
of images (``--input dir/`` + ``--output dir/``). Writes an
``anonymize_report.json`` summarizing face counts + skipped frames so
the export pipeline (PRD-017 §11.3) can flag frames where no face was
found (which usually means the frame should NOT be exported — see
PRD-017 §18.3 head/gaze caveat).

Usage:

    # Single frame
    python -m scripts.anonymize_frame \\
        --input  data/internal/raw/exam42/frame_001.jpg \\
        --output data/internal/positives/exam42_001.jpg

    # Whole directory (jpg + png)
    python -m scripts.anonymize_frame \\
        --input  data/internal/raw/exam42/ \\
        --output data/internal/positives/ \\
        --report data/internal/positives/anonymize_report.json
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

# PRD-017 §18.3: blur kernel must be coarse enough that re-identification
# fails for both human raters and downstream face-recognition models.
DEFAULT_KERNEL = 31
DEFAULT_SIGMA  = 30.0
IMAGE_EXTS     = {".jpg", ".jpeg", ".png", ".webp"}


# ──────────────────── face detection ────────────────────

def _detect_opencv(bgr: Any) -> list[tuple[int, int, int, int]]:
    """Frontal Haar cascade → list of (x, y, w, h) in image pixels."""
    import cv2  # type: ignore[import-untyped]
    cascade_path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
    if not cascade_path.is_file():
        raise RuntimeError(f"Haar cascade missing: {cascade_path}")
    cascade = cv2.CascadeClassifier(str(cascade_path))
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=4,
        minSize=(30, 30),
    )
    return [(int(x), int(y), int(w), int(h)) for x, y, w, h in faces]


def _detect_mediapipe(bgr: Any) -> list[tuple[int, int, int, int]]:
    import cv2  # type: ignore[import-untyped]
    import mediapipe as mp  # type: ignore[import-not-found]

    h, w = bgr.shape[:2]
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    out: list[tuple[int, int, int, int]] = []
    with mp.solutions.face_detection.FaceDetection(
        model_selection=1,   # full-range — better for classroom wide shots
        min_detection_confidence=0.5,
    ) as detector:
        res = detector.process(rgb)
        if not res.detections:
            return out
        for det in res.detections:
            box = det.location_data.relative_bounding_box
            x = max(int(box.xmin * w), 0)
            y = max(int(box.ymin * h), 0)
            bw = min(int(box.width * w), w - x)
            bh = min(int(box.height * h), h - y)
            if bw > 0 and bh > 0:
                out.append((x, y, bw, bh))
    return out


def detect_faces(bgr: Any, backend: str) -> list[tuple[int, int, int, int]]:
    if backend == "mediapipe":
        return _detect_mediapipe(bgr)
    return _detect_opencv(bgr)


# ──────────────────── blur ────────────────────

def anonymize_faces(
    bgr: Any,
    face_bboxes: list[tuple[int, int, int, int]],
    *,
    kernel: int = DEFAULT_KERNEL,
    sigma: float = DEFAULT_SIGMA,
    padding_ratio: float = 0.1,
) -> Any:
    """Apply Gaussian blur over every face bbox. Returns a fresh BGR array."""
    import cv2  # type: ignore[import-untyped]
    out = bgr.copy()
    h, w = out.shape[:2]
    # Kernel must be odd for cv2.GaussianBlur.
    k = kernel if kernel % 2 == 1 else kernel + 1
    for (x, y, fw, fh) in face_bboxes:
        # Pad bbox so jawline / hair edges are also blurred.
        pad_x = int(fw * padding_ratio)
        pad_y = int(fh * padding_ratio)
        x0 = max(x - pad_x, 0)
        y0 = max(y - pad_y, 0)
        x1 = min(x + fw + pad_x, w)
        y1 = min(y + fh + pad_y, h)
        roi = out[y0:y1, x0:x1]
        if roi.size == 0:
            continue
        out[y0:y1, x0:x1] = cv2.GaussianBlur(roi, (k, k), sigma)
    return out


# ──────────────────── IO ────────────────────

def _iter_image_paths(target: Path) -> list[Path]:
    if target.is_file():
        return [target]
    return sorted(p for p in target.rglob("*") if p.suffix.lower() in IMAGE_EXTS)


def anonymize_one(
    image_path: Path,
    output_path: Path,
    *,
    backend: str,
    kernel: int,
    sigma: float,
    drop_if_no_face: bool,
) -> dict[str, Any]:
    import cv2  # type: ignore[import-untyped]
    bgr = cv2.imread(str(image_path))
    if bgr is None:
        return {"path": str(image_path), "status": "decode_failed", "faces": 0}

    faces = detect_faces(bgr, backend)
    if not faces:
        if drop_if_no_face:
            return {"path": str(image_path), "status": "dropped_no_face", "faces": 0}
        # No face → still write the original through. PRD-017 §18.3 warns to
        # check this case; we surface it in the report so the operator can
        # decide whether to drop or re-detect with a different backend.
        log.warning("no face detected — copying through: %s", image_path)
        cv2.imwrite(str(output_path), bgr)
        return {"path": str(image_path), "status": "no_face", "faces": 0}

    blurred = anonymize_faces(bgr, faces, kernel=kernel, sigma=sigma)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), blurred)
    return {"path": str(image_path), "status": "anonymized", "faces": len(faces)}


# ──────────────────── CLI ────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Gaussian-blur faces in evidence frames "
                    "(PRD-021 §3 Sprint 14 BL-263 / PRD-017 §18.3)"
    )
    parser.add_argument("--input", required=True, type=Path,
                        help="Input image OR directory of images")
    parser.add_argument("--output", required=True, type=Path,
                        help="Output path (file or directory)")
    parser.add_argument("--backend", default="opencv",
                        choices=["opencv", "mediapipe"],
                        help="Face detection backend (default: opencv Haar)")
    parser.add_argument("--kernel", type=int, default=DEFAULT_KERNEL,
                        help="Gaussian blur kernel size (odd; default: 31)")
    parser.add_argument("--sigma", type=float, default=DEFAULT_SIGMA,
                        help="Gaussian sigma (default: 30.0)")
    parser.add_argument("--drop-if-no-face", action="store_true",
                        help="Skip frames where no face is detected")
    parser.add_argument("--report", type=Path,
                        help="Path to write anonymize_report.json")
    args = parser.parse_args(argv)

    images = _iter_image_paths(args.input)
    if not images:
        parser.error(f"no images under {args.input}")

    is_dir_mode = args.input.is_dir() or len(images) > 1
    results: list[dict[str, Any]] = []
    for img_path in images:
        if is_dir_mode:
            args.output.mkdir(parents=True, exist_ok=True)
            out_path = args.output / img_path.relative_to(args.input)
        else:
            out_path = args.output
        results.append(anonymize_one(
            img_path, out_path,
            backend=args.backend,
            kernel=args.kernel,
            sigma=args.sigma,
            drop_if_no_face=args.drop_if_no_face,
        ))

    summary = {
        "anonymized_at":   datetime.now(timezone.utc).isoformat(),
        "input":           str(args.input),
        "output":          str(args.output),
        "backend":         args.backend,
        "kernel":          args.kernel,
        "sigma":           args.sigma,
        "total":           len(results),
        "anonymized":      sum(1 for r in results if r["status"] == "anonymized"),
        "no_face":         sum(1 for r in results if r["status"] == "no_face"),
        "dropped_no_face": sum(1 for r in results if r["status"] == "dropped_no_face"),
        "decode_failed":   sum(1 for r in results if r["status"] == "decode_failed"),
        "total_faces":     sum(r["faces"] for r in results),
        "details":         results[:200],  # cap report size
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(summary, indent=2, ensure_ascii=False),
                               encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "details"}, indent=2))
    return 0 if summary["decode_failed"] == 0 else 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(main())
