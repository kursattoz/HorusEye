"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { routes } from "@/constants/routes";

const CHECK_INTERVAL_MS = 60_000; // 60 seconds

/** Custom event name dispatched when any API call receives a 401 */
export const SESSION_EXPIRED_EVENT = "horuseye:session-expired";

export function SessionExpiredModal() {
  const [expired, setExpired] = useState(false);
  const wasAuthenticated = useRef(false);
  const router = useRouter();
  const supabase = createClient();

  const markExpired = useCallback(() => {
    if (wasAuthenticated.current) {
      setExpired(true);
    }
  }, []);

  useEffect(() => {
    // Mark the user as authenticated on mount (since this component
    // only renders inside the protected layout)
    wasAuthenticated.current = true;

    // ── 1. Supabase auth state listener ──
    // Fires immediately when a token refresh fails (SIGNED_OUT)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        markExpired();
      }
    });

    // ── 2. Polling fallback ──
    async function checkSession() {
      if (document.visibilityState !== "visible") return;

      const { error } = await supabase.auth.getUser();
      if (error && wasAuthenticated.current) {
        markExpired();
      }
    }

    const interval = setInterval(checkSession, CHECK_INTERVAL_MS);

    // ── 3. Visibility change check ──
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        checkSession();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // ── 4. Listen for custom 401 events from API calls ──
    function handleSessionExpiredEvent() {
      markExpired();
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpiredEvent);

    // ── 5. Global fetch interceptor for 401 from /api/ routes ──
    const originalFetch = window.fetch;
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const response = await originalFetch.apply(this, args);
      if (response.status === 401) {
        const url =
          typeof args[0] === "string"
            ? args[0]
            : args[0] instanceof Request
              ? args[0].url
              : "";
        if (url.startsWith("/api/")) {
          markExpired();
        }
      }
      return response;
    };

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(
        SESSION_EXPIRED_EVENT,
        handleSessionExpiredEvent,
      );
      window.fetch = originalFetch;
    };
  }, [supabase, markExpired]);

  return (
    <Dialog open={expired}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Oturum Sona Erdi</DialogTitle>
          <DialogDescription>
            Oturumunuz sona erdi. L&uuml;tfen tekrar giri&#351; yap&#305;n.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button onClick={() => router.push(routes.login)}>
            Giri&#351; Yap
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
