"""session_meta cache tests — BL-205."""

from __future__ import annotations

from typing import Any

import pytest

from src.persistence import session_meta, supabase_client


# ───────── stubs ─────────

class _Result:
    def __init__(self, count: int) -> None:
        self.count = count


class _Query:
    def __init__(self, count: int, fail: bool = False) -> None:
        self._count = count
        self._fail = fail

    def select(self, *_a, **_kw) -> "_Query":
        return self

    def eq(self, *_a, **_kw) -> "_Query":
        return self

    def execute(self) -> _Result:
        if self._fail:
            raise RuntimeError("DB down")
        return _Result(self._count)


class _Client:
    def __init__(self, students: int, proctors: int, fail: bool = False) -> None:
        self._students = students
        self._proctors = proctors
        self._fail = fail

    def table(self, name: str) -> _Query:
        if name == "session_students":
            return _Query(self._students, self._fail)
        if name == "session_proctors":
            return _Query(self._proctors, self._fail)
        raise AssertionError(f"unexpected table: {name}")


@pytest.fixture(autouse=True)
def _reset():
    session_meta.reset_cache_for_tests()
    supabase_client.reset_for_tests()
    yield
    session_meta.reset_cache_for_tests()
    supabase_client.reset_for_tests()


# ───────── tests ─────────

def test_returns_sum_of_students_and_proctors() -> None:
    supabase_client.set_client_for_tests(_Client(students=12, proctors=2))
    assert session_meta.get_expected_person_count("s1") == 14


def test_caches_after_first_call() -> None:
    client = _Client(students=10, proctors=1)
    supabase_client.set_client_for_tests(client)
    a = session_meta.get_expected_person_count("s1")
    # Mutate the underlying counts; cache must not refetch
    client._students = 99
    b = session_meta.get_expected_person_count("s1")
    assert a == b == 11


def test_returns_none_on_supabase_error() -> None:
    supabase_client.set_client_for_tests(_Client(students=0, proctors=0, fail=True))
    assert session_meta.get_expected_person_count("s1") is None


def test_returns_none_when_supabase_unconfigured(monkeypatch) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    supabase_client.reset_for_tests()
    assert session_meta.get_expected_person_count("s1") is None


def test_set_cache_for_tests_overrides_fetch() -> None:
    session_meta.set_cache_for_tests("s1", 99)
    assert session_meta.get_expected_person_count("s1") == 99
