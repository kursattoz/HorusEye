'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TimePickerProps {
  value: string | undefined;
  onChange: (time: string | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export function TimePicker({ value, onChange, placeholder = 'Pick time', className, disabled }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const hourRef = useRef<HTMLDivElement>(null);
  const minRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedHour, selectedMin] = (value ?? '').split(':');

  // Auto-scroll to selected hour when dropdown opens
  useEffect(() => {
    if (open && hourRef.current && selectedHour) {
      const idx = HOURS.indexOf(selectedHour);
      if (idx > 0) {
        hourRef.current.scrollTop = Math.max(0, idx * 32 - 48);
      }
    }
  }, [open, selectedHour]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="outline"
        disabled={disabled}
        type="button"
        className={cn(
          'justify-start text-left font-normal',
          !value && 'text-muted-foreground',
          className,
        )}
        onClick={() => setOpen(o => !o)}
      >
        <Clock className="mr-2 h-4 w-4" />
        {value ?? placeholder}
      </Button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded-lg shadow-lg p-2 flex gap-2">
          {/* Hours */}
          <div
            ref={hourRef}
            className="flex flex-col gap-0.5 h-[220px] overflow-y-auto overscroll-contain"
            style={{ scrollbarWidth: 'thin' }}
          >
            <p className="text-[9px] text-muted-foreground text-center mb-1 sticky top-0 bg-popover z-10 pb-0.5">Hr</p>
            {HOURS.map(h => (
              <button
                key={h}
                type="button"
                className={cn(
                  'px-3 py-1 text-xs rounded-md hover:bg-accent transition-colors shrink-0 min-h-[28px]',
                  selectedHour === h && 'bg-primary text-primary-foreground hover:bg-primary',
                )}
                onClick={() => {
                  onChange(`${h}:${selectedMin ?? '00'}`);
                }}
              >
                {h}
              </button>
            ))}
          </div>

          {/* Minutes */}
          <div
            ref={minRef}
            className="flex flex-col gap-0.5 h-[220px] overflow-y-auto overscroll-contain border-l pl-2"
            style={{ scrollbarWidth: 'thin' }}
          >
            <p className="text-[9px] text-muted-foreground text-center mb-1 sticky top-0 bg-popover z-10 pb-0.5">Min</p>
            {MINUTES.map(m => (
              <button
                key={m}
                type="button"
                className={cn(
                  'px-3 py-1 text-xs rounded-md hover:bg-accent transition-colors shrink-0 min-h-[28px]',
                  selectedMin === m && 'bg-primary text-primary-foreground hover:bg-primary',
                )}
                onClick={() => {
                  onChange(`${selectedHour ?? '09'}:${m}`);
                  setOpen(false);
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
