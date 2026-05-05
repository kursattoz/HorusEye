// BL-190 / BL-200 — IncidentCard rendering + evidence fetch + expand panel.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IncidentCard } from '@/components/exams/IncidentCard';
import type { ServerIncident } from '@/types/ai';

const baseIncident: ServerIncident = {
  type: 'incident',
  protocol_version: '1.1',
  message_id: 'msg-1',
  session_id: 'sess-1',
  incident_id: 'inc-1',
  student_id: null,
  track_id: 7,
  incident_type: 'phone_detected',
  severity: 'high',
  confidence: 0.78,
  risk_score: null,
  triggered_rules: ['phone_in_hand:sustained≥3.0s'],
  camera_ids: ['cam-1'],
  evidence_paths: ['sess-1/inc-1.jpg'],
  occurred_at: '2026-05-05T12:00:00Z',
};

describe('IncidentCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders severity, type, and confidence', () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ signed_url: 'https://signed.example/x' })),
    );
    render(<IncidentCard incident={baseIncident} />);
    expect(screen.getByText('high')).toBeDefined();
    expect(screen.getByText(/phone detected/i)).toBeDefined();
    expect(screen.getByText(/confidence 78%/)).toBeDefined();
    expect(screen.getByText(/Track 7/)).toBeDefined();
  });

  it('shows triggered rules tooltip', () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ signed_url: 'https://signed.example/x' })),
    );
    render(<IncidentCard incident={baseIncident} />);
    expect(screen.getByText('phone_in_hand:sustained≥3.0s')).toBeDefined();
  });

  it('fetches evidence and renders the signed URL as <img>', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ signed_url: 'https://signed.example/x' })),
    );
    render(<IncidentCard incident={baseIncident} />);
    await waitFor(() => {
      const img = screen.getByAltText('Incident evidence') as HTMLImageElement;
      expect(img.src).toBe('https://signed.example/x');
    });
    // Includes ?path query param matching the first evidence path
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/incidents/inc-1/evidence?path=sess-1%2Finc-1.jpg',
    );
  });

  it('skips evidence fetch when no paths attached', () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(
      <IncidentCard incident={{ ...baseIncident, evidence_paths: [] }} />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to student id when present', () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ signed_url: '' })),
    );
    render(
      <IncidentCard
        incident={{ ...baseIncident, student_id: '20210001', track_id: null }}
      />,
    );
    expect(screen.getByText(/Student 20210001/)).toBeDefined();
  });

  // ───────── BL-200 expand panel ─────────

  it('lazy-fetches incident detail on first expand and shows raw_signals', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith('/evidence?path=sess-1%2Finc-1.jpg')) {
        return new Response(JSON.stringify({ signed_url: 'https://signed/x' }));
      }
      if (u === '/api/incidents/inc-1') {
        return new Response(JSON.stringify({
          incident: {
            id: 'inc-1',
            incident_type: 'gaze_diversion',
            severity: 'medium',
            confidence: 0.7,
            triggered_rules: [],
            evidence_paths: [],
            raw_signals: {
              rule: 'gaze_diversion',
              fires_in_5min: 3,
              yaw_threshold: 30,
            },
            occurred_at: baseIncident.occurred_at,
          },
        }));
      }
      return new Response('not found', { status: 404 });
    });

    const { container } = render(<IncidentCard incident={baseIncident} />);

    // Card not yet expanded → detail endpoint must NOT have been called yet
    expect(fetchSpy.mock.calls.find(c => String(c[0]) === '/api/incidents/inc-1')).toBeUndefined();

    // Click button to expand (button is the whole card row)
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    fireEvent.click(button!);

    await waitFor(() => {
      expect(fetchSpy.mock.calls.find(c => String(c[0]) === '/api/incidents/inc-1')).toBeDefined();
    });
    await waitFor(() => {
      expect(container.textContent).toContain('fires_in_5min');
      expect(container.textContent).toContain('rule');
    });
  });

  it('handles incident detail fetch failure gracefully', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith('/evidence?path=sess-1%2Finc-1.jpg')) {
        return new Response(JSON.stringify({ signed_url: 'https://signed/x' }));
      }
      return new Response('boom', { status: 500 });
    });

    const { container } = render(<IncidentCard incident={baseIncident} />);
    fireEvent.click(container.querySelector('button')!);

    await waitFor(() => {
      expect(container.textContent?.toLowerCase()).toContain('no detail available');
    });
  });
});
