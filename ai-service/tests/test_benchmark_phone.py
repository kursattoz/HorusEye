"""Benchmark math — BL-193.

Validates the ClassMetrics computation. We don't drive the YOLO loop
in unit tests (that needs the 5 MB weights + real frames); the
acceptance script itself is exercised in the BL-193 wiki page.
"""

from __future__ import annotations

import pytest

from scripts.benchmark_phone import ClassMetrics


def test_precision_recall_f1_happy_path() -> None:
    m = ClassMetrics(tp=8, fp=2, fn=0)
    assert m.precision == pytest.approx(0.80)
    assert m.recall    == pytest.approx(1.0)
    assert m.f1        == pytest.approx(2 * 0.8 * 1.0 / (0.8 + 1.0))


def test_zero_division_is_zero_not_nan() -> None:
    m = ClassMetrics()
    assert m.precision == 0.0
    assert m.recall    == 0.0
    assert m.f1        == 0.0


def test_metrics_serializable() -> None:
    m = ClassMetrics(tp=10, fp=5, fn=3)
    d = m.as_dict()
    assert d["tp"] == 10
    assert d["fp"] == 5
    assert d["fn"] == 3
    assert 0 < d["precision"] <= 1
    assert 0 < d["recall"]    <= 1
    assert 0 < d["f1"]        <= 1


def test_only_false_positives_drop_precision() -> None:
    m = ClassMetrics(tp=5, fp=20, fn=0)
    assert m.precision == pytest.approx(5 / 25)
    assert m.recall    == pytest.approx(1.0)


def test_only_false_negatives_drop_recall() -> None:
    m = ClassMetrics(tp=5, fp=0, fn=15)
    assert m.precision == pytest.approx(1.0)
    assert m.recall    == pytest.approx(5 / 20)
