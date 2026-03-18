import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageTracking } from '@/hooks/usePageTracking';

// Mock next/navigation
const mockPathname = vi.fn(() => '/dashboard');
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

describe('usePageTracking', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response());
    // Reset sessionStorage between tests
    sessionStorage.clear();
    mockPathname.mockReturnValue('/dashboard');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires a POST to /api/log/page on mount', () => {
    renderHook(() => usePageTracking());
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/log/page',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('includes pathname and sessionId in the body', () => {
    renderHook(() => usePageTracking());
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.pathname).toBe('/dashboard');
    expect(typeof body.sessionId).toBe('string');
    expect(body.sessionId.length).toBeGreaterThan(0);
  });

  it('includes userId when provided', () => {
    renderHook(() => usePageTracking('user-abc'));
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.userId).toBe('user-abc');
  });

  it('does not fire again for the same pathname', () => {
    const { rerender } = renderHook(() => usePageTracking());
    rerender();
    // Same pathname — only one fetch call
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fires again when the pathname changes', () => {
    mockPathname.mockReturnValue('/dashboard');
    const { rerender } = renderHook(() => usePageTracking());
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    mockPathname.mockReturnValue('/files');
    rerender();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
