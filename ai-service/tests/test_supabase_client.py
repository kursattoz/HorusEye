"""Supabase service-role client tests — BL-185."""

from __future__ import annotations

import pytest

from src.persistence import supabase_client


@pytest.fixture(autouse=True)
def _reset_singleton():
    supabase_client.reset_for_tests()
    yield
    supabase_client.reset_for_tests()


def test_missing_env_raises_runtime_error(monkeypatch) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        supabase_client.get_supabase_admin()


def test_set_client_for_tests_overrides_singleton() -> None:
    sentinel = object()
    supabase_client.set_client_for_tests(sentinel)
    assert supabase_client.get_supabase_admin() is sentinel


def test_singleton_returns_same_instance() -> None:
    sentinel = object()
    supabase_client.set_client_for_tests(sentinel)
    a = supabase_client.get_supabase_admin()
    b = supabase_client.get_supabase_admin()
    assert a is b
