// PRD-019 §6.2 — Public phone pair page. Reads pair token from query
// param, redeems it for AI publish info, then mounts the capture UI.
// Not in (protected) — Supabase auth NOT required (token-only access).

import { Suspense } from 'react';
import { headers } from 'next/headers';
import { CamPairCapture, CamPairCaptureLoading } from '@/components/exams/CamPairCapture';

export const dynamic = 'force-dynamic';

interface RedeemPayload {
  camera_id: string;
  session_id: string | null;
  owner_user_id: string;
  ws_publish_url: string | null;
  api_key: string;
  protocol_version: string;
}

function validateDemoVideo(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Same-origin static path under /demo/… (or any local path).
  if (/^\/[\w\-./]+$/.test(raw)) return raw;
  // Supabase public demo-assets bucket on the configured project.
  const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  if (supabaseBase) {
    const prefix = `${supabaseBase}/storage/v1/object/public/demo-assets/`;
    if (raw.startsWith(prefix) && /^[\w\-./]+$/.test(raw.slice(prefix.length))) {
      return raw;
    }
  }
  return undefined;
}

async function redeem(token: string): Promise<{ ok: true; payload: RedeemPayload } | { ok: false; error: string; status: number }> {
  // Build the absolute URL from the incoming request — request.nextUrl.origin
  // returns the internal container hostname in ECS, which the fetch then can't
  // reach. Fall back to NEXT_PUBLIC_APP_URL when the headers are not available.
  const h = await headers();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');

  const r = await fetch(`${base}/api/cameras/pair/redeem?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: d.error ?? 'redeem failed', status: r.status };
  return { ok: true, payload: d as RedeemPayload };
}

export default async function CamPairPage({ searchParams }: { searchParams: Promise<{ token?: string; video?: string }> }) {
  const params   = await searchParams;
  const token    = params.token;
  // Demo mode: when ?video=<url> is present, the pair page loops the asset
  // instead of using the device camera. To keep this from being abused to
  // pull arbitrary external URLs through the demo flow, only allow:
  //   - same-origin paths (^/[\w\-./]+$), OR
  //   - the public demo-assets bucket on the configured Supabase project.
  // Canvas drawImage would CORS-fail any other origin anyway.
  const videoUrl = validateDemoVideo(params.video);

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-lg font-semibold">Eksik token</h1>
          <p className="text-sm text-muted-foreground">
            Bu sayfa yalnızca PC tarafındaki QR kod taranarak açılır.
          </p>
        </div>
      </main>
    );
  }

  const result = await redeem(token);
  if (!result.ok) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-lg font-semibold">
            {result.status === 410 ? 'Token süresi doldu' : 'Geçersiz token'}
          </h1>
          <p className="text-sm text-muted-foreground">
            PC tarafından yeniden QR oluşturup okutmanız gerekiyor.
          </p>
          <p className="text-[11px] text-muted-foreground/70">{result.error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-3 bg-muted/30">
      <div className="max-w-md mx-auto space-y-3">
        <header className="text-center pt-2">
          <h1 className="text-base font-semibold">HorusEye Phone Camera</h1>
          <p className="text-xs text-muted-foreground">
            Telefonu sınav süresince stabil bir yere koyup ekranı açık tutun.
          </p>
        </header>

        <Suspense fallback={<CamPairCaptureLoading />}>
          <CamPairCapture token={token} redeem={result.payload} videoUrl={videoUrl} />
        </Suspense>
      </div>
    </main>
  );
}
