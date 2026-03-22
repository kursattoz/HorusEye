'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths,
  subMonths, format, isSameMonth, isToday, isWithinInterval, parseISO,
} from 'date-fns';
import { tr } from 'date-fns/locale';

interface CalendarEvent {
  date: string;
  type: string;
  title: string;
  color: string;
}

interface MonthlyCalendarProps {
  events: CalendarEvent[];
}

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

// Sprint color palette for background ranges
const SPRINT_BG_COLORS = [
  { bg: 'bg-blue-500/8 dark:bg-blue-500/15', border: 'border-blue-500/20' },
  { bg: 'bg-purple-500/8 dark:bg-purple-500/15', border: 'border-purple-500/20' },
  { bg: 'bg-amber-500/8 dark:bg-amber-500/15', border: 'border-amber-500/20' },
  { bg: 'bg-green-500/8 dark:bg-green-500/15', border: 'border-green-500/20' },
];

export function MonthlyCalendar({ events }: MonthlyCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  // Build weeks
  const weeks: Date[][] = [];
  let day = calStart;
  while (day <= calEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }

  // Extract sprint ranges from start/end events
  const sprintRanges: { start: Date; end: Date; name: string; colorIdx: number }[] = [];
  const startEvents = events.filter(e => e.type === 'sprint_start');
  const endEvents = events.filter(e => e.type === 'sprint_end');

  startEvents.forEach((se, i) => {
    const matchingEnd = endEvents[i];
    if (matchingEnd) {
      sprintRanges.push({
        start: parseISO(se.date),
        end: parseISO(matchingEnd.date),
        name: se.title.replace(' starts', ''),
        colorIdx: i % SPRINT_BG_COLORS.length,
      });
    }
  });

  // Point events (non-sprint)
  const pointEvents = events.filter(e => e.type !== 'sprint_start' && e.type !== 'sprint_end');
  const eventMap = new Map<string, CalendarEvent[]>();
  for (const ev of pointEvents) {
    if (!eventMap.has(ev.date)) eventMap.set(ev.date, []);
    eventMap.get(ev.date)!.push(ev);
  }

  // Check which sprint a date falls in
  function getSprintForDate(d: Date) {
    for (const sr of sprintRanges) {
      if (isWithinInterval(d, { start: sr.start, end: sr.end })) {
        return sr;
      }
    }
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Header: month nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronRight size={16} />
          </Button>
        </div>
        <h3 className="text-sm font-semibold">
          {format(currentMonth, 'MMMM yyyy', { locale: tr })}
        </h3>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => setCurrentMonth(new Date())}>
          Today
        </Button>
      </div>

      {/* Grid */}
      <div className="border rounded-lg overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-0">
            {week.map((d) => {
              const dateStr = format(d, 'yyyy-MM-dd');
              const dayEvents = eventMap.get(dateStr) ?? [];
              const inMonth = isSameMonth(d, currentMonth);
              const today = isToday(d);
              const sprint = getSprintForDate(d);
              const sprintColor = sprint ? SPRINT_BG_COLORS[sprint.colorIdx] : null;

              // Sprint range edge detection
              const isSprintStart = sprint && format(sprint.start, 'yyyy-MM-dd') === dateStr;
              const isSprintEnd = sprint && format(sprint.end, 'yyyy-MM-dd') === dateStr;

              return (
                <div
                  key={dateStr}
                  className={cn(
                    'min-h-[90px] p-1.5 border-r last:border-0 transition-colors relative',
                    !inMonth && 'bg-muted/10',
                    today && !sprintColor && 'bg-primary/5',
                    sprintColor && sprintColor.bg,
                  )}
                >
                  {/* Sprint label on first day */}
                  {isSprintStart && (
                    <div className={cn(
                      'absolute top-0 left-0 right-0 text-[8px] font-medium px-1 py-0.5 truncate',
                      sprintColor?.border,
                      'border-b',
                    )} style={{ color: ['#3b82f6', '#a855f7', '#f59e0b', '#22c55e'][sprint.colorIdx] }}>
                      {sprint.name}
                    </div>
                  )}

                  {/* Day number */}
                  <div className={cn('flex items-center justify-between', isSprintStart && 'mt-3')}>
                    <span
                      className={cn(
                        'text-[11px] w-5 h-5 flex items-center justify-center rounded-full',
                        today && 'bg-primary text-primary-foreground font-bold',
                        !inMonth && 'text-muted-foreground/30',
                        inMonth && !today && 'text-foreground',
                      )}
                    >
                      {format(d, 'd')}
                    </span>
                    {isSprintEnd && (
                      <span className="text-[7px] text-muted-foreground">end</span>
                    )}
                  </div>

                  {/* Events */}
                  <div className="space-y-0.5 mt-1">
                    {dayEvents.slice(0, 2).map((ev, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1 rounded px-1 py-0.5 text-[9px] leading-tight truncate"
                        style={{ backgroundColor: ev.color + '20', color: ev.color }}
                        title={ev.title}
                      >
                        <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                        <span className="truncate">{ev.title}</span>
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[8px] text-muted-foreground pl-1">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[10px] text-muted-foreground">
        {sprintRanges.map((sr, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className={cn('w-4 h-2 rounded-sm', SPRINT_BG_COLORS[sr.colorIdx]?.bg, 'border', SPRINT_BG_COLORS[sr.colorIdx]?.border)} />
            {sr.name}
          </span>
        ))}
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500" /> Deliverable due</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-green-500" /> Completed</span>
      </div>
    </div>
  );
}
