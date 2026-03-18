import { describe, it, expect, vi } from 'vitest';
import { switchTheme } from '@/lib/utils/switchTheme';

describe('switchTheme', () => {
  it('calls setTheme directly when startViewTransition is not available', () => {
    const setTheme = vi.fn();
    // jsdom does not implement startViewTransition
    switchTheme(setTheme, 'dark');
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('calls setTheme via startViewTransition when available', () => {
    const setTheme = vi.fn();
    const mockStart = vi.fn((cb: () => void) => cb());
    Object.defineProperty(document, 'startViewTransition', {
      value: mockStart,
      configurable: true,
    });

    switchTheme(setTheme, 'light');
    expect(mockStart).toHaveBeenCalled();
    expect(setTheme).toHaveBeenCalledWith('light');

    // Cleanup
    Object.defineProperty(document, 'startViewTransition', {
      value: undefined,
      configurable: true,
    });
  });

  it('passes any theme string through', () => {
    const setTheme = vi.fn();
    switchTheme(setTheme, 'system');
    expect(setTheme).toHaveBeenCalledWith('system');
  });
});
