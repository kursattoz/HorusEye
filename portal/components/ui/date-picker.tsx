'use client';

import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  /** YYYY-MM-DD string or undefined */
  value: string | undefined;
  onChange: (date: string | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/** Parse YYYY-MM-DD to local Date (avoids timezone shift) */
function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** Format Date to YYYY-MM-DD using local parts (avoids timezone shift) */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format for display */
function formatDisplay(str: string): string {
  const d = parseLocalDate(str);
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function DatePicker({ value, onChange, placeholder = 'Pick a date', className, disabled }: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const dateObj = value ? parseLocalDate(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'justify-start text-left font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? formatDisplay(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          key={value ?? 'empty'}
          mode="single"
          captionLayout="dropdown"
          selected={dateObj}
          defaultMonth={dateObj}
          startMonth={new Date(2025, 0)}
          endMonth={new Date(2027, 11)}
          onSelect={(d) => {
            onChange(d ? toDateString(d) : undefined);
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
