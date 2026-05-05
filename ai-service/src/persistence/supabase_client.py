"""Supabase service-role client — BL-185 (PRD-013 §7.1).

Reads ``SUPABASE_URL`` + ``SUPABASE_SERVICE_ROLE_KEY`` from the environment
(both wired by ``infra/lib/ai-service-stack.ts``) and returns a singleton
service-role client. The service role bypasses RLS so the AI service can
INSERT into ``incidents`` from any session without per-user auth.

Tests can call :func:`reset_for_tests` between cases to clear the
singleton, and :func:`set_client_for_tests` to inject a stub.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Any

log = logging.getLogger(__name__)

_client: Any | None = None
_lock = threading.Lock()


def _build_client() -> Any:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set "
            "for incident persistence (see infra/lib/ai-service-stack.ts)."
        )
    # Lazy import — supabase pulls in httpx + websockets which we don't want
    # to load when persistence is disabled in tests.
    from supabase import Client, create_client  # type: ignore[import-untyped]
    client: Client = create_client(url, key)
    log.info("supabase service-role client initialized url=%s", url)
    return client


def get_supabase_admin() -> Any:
    """Return the process-wide service-role client, creating it on first use.

    Raises ``RuntimeError`` when env vars are missing — the publish handler
    catches this and continues without persistence (best-effort), so a
    misconfigured deploy still streams frames to the dashboard while
    incidents simply aren't written.
    """
    global _client
    if _client is not None:
        return _client
    with _lock:
        if _client is None:
            _client = _build_client()
        return _client


def reset_for_tests() -> None:
    """Wipe the singleton — tests."""
    global _client
    with _lock:
        _client = None


def set_client_for_tests(stub: Any) -> None:
    """Inject a stub — tests."""
    global _client
    with _lock:
        _client = stub
