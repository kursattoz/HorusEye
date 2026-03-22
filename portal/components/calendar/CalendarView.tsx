'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, ChevronLeft, ChevronRight, Trash2, MapPin, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths,
  addWeeks, subWeeks, startOfDay, format, isSameMonth, isSameDay, isToday,
  isWithinInterval, parseISO, differenceInDays,
} from 'date-fns';
import { tr } from 'date-fns/locale';

type ViewMode = 'day' | 'week' | 'month' | '3month';

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  all_day: boolean;
  event_type: string;
  color: string;
  location: string | null;
  reminder_minutes: number | null;
  recurrence: string | null;
  created_by: string;
  attendees?: { user_id: string; status: string; user: { full_name: string; avatar_url: string | null } | null }[];
  creator?: { full_name: string } | null;
}

interface SprintEvent { name: string; start_date: string; end_date: string; status: string }
interface DeliverableEvent { title: string; deliverable_number: string; deadline: string; status: string }

interface TeamMember { id: string; full_name: string }

const EVENT_COLORS = [
  { value: '#3b82f6', label: 'Blue' },
  { value: '#22c55e', label: 'Green' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#a855f7', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
];

const REMINDER_OPTIONS = [
  { value: 0, label: 'At time of event' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const SPRINT_BG = [
  { bg: 'bg-blue-500/8 dark:bg-blue-500/15' },
  { bg: 'bg-purple-500/8 dark:bg-purple-500/15' },
  { bg: 'bg-amber-500/8 dark:bg-amber-500/15' },
  { bg: 'bg-green-500/8 dark:bg-green-500/15' },
];

export function CalendarView() {
  const [view, setView] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [sprints, setSprints] = useState<SprintEvent[]>([]);
  const [deliverables, setDeliverables] = useState<DeliverableEvent[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [creating, setCreating] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    title: '', description: '', start_date: '', start_time: '', end_date: '', end_time: '',
    all_day: false, event_type: 'meeting', color: '#3b82f6', location: '',
    reminder_minutes: '' as string, recurrence: '', attendees: [] as string[],
  });

  async function fetchEvents() {
    const res = await fetch('/api/calendar');
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events ?? []);
      setSprints(data.sprints ?? []);
      setDeliverables(data.deliverables ?? []);
    }
  }

  async function fetchTeam() {
    const res = await fetch('/api/settings/dev-roles');
    if (res.ok) {
      const data = await res.json();
      setTeam((data.members ?? []).map((m: { id: string; full_name: string }) => ({ id: m.id, full_name: m.full_name })));
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { fetchEvents(); fetchTeam(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleCreate() {
    if (!form.title.trim() || !form.start_date) return;
    if (form.end_date && form.end_date < form.start_date) {
      toast.error('End date cannot be before start date');
      return;
    }
    if (form.end_date === form.start_date && form.end_time && form.start_time && form.end_time <= form.start_time) {
      toast.error('End time cannot be before start time');
      return;
    }
    setCreating(true);

    const startTime = form.all_day
      ? `${form.start_date}T00:00:00`
      : `${form.start_date}T${form.start_time || '09:00'}:00`;
    const endTime = form.end_date
      ? (form.all_day ? `${form.end_date}T23:59:59` : `${form.end_date}T${form.end_time || form.start_time || '10:00'}:00`)
      : null;

    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        description: form.description || null,
        start_time: startTime,
        end_time: endTime,
        all_day: form.all_day,
        event_type: form.event_type,
        color: form.color,
        location: form.location || null,
        reminder_minutes: form.reminder_minutes ? parseInt(form.reminder_minutes) : null,
        recurrence: form.recurrence || null,
        attendees: form.attendees,
      }),
    });
    setCreating(false);
    if (!res.ok) { toast.error('Failed to create event'); return; }
    setCreateOpen(false);
    resetForm();
    fetchEvents();
    toast.success('Event created & attendees notified');
  }

  async function handleDelete(eventId: string) {
    const res = await fetch(`/api/calendar/${eventId}`, { method: 'DELETE' });
    if (res.ok) { setSelectedEvent(null); fetchEvents(); toast.success('Event deleted'); }
  }

  function resetForm() {
    setForm({
      title: '', description: '', start_date: '', start_time: '', end_date: '', end_time: '',
      all_day: false, event_type: 'meeting', color: '#3b82f6', location: '',
      reminder_minutes: '', recurrence: '', attendees: [],
    });
  }

  function navigate(dir: 1 | -1) {
    setCurrentDate(prev => {
      if (view === 'month') return dir === 1 ? addMonths(prev, 1) : subMonths(prev, 1);
      if (view === '3month') return dir === 1 ? addMonths(prev, 3) : subMonths(prev, 3);
      if (view === 'week') return dir === 1 ? addWeeks(prev, 1) : subWeeks(prev, 1);
      return addDays(prev, dir);
    });
  }

  // Build event lookup for a given date
  function getEventsForDate(d: Date) {
    const dateStr = format(d, 'yyyy-MM-dd');
    return events.filter(e => {
      const eDate = format(parseISO(e.start_time), 'yyyy-MM-dd');
      return eDate === dateStr;
    });
  }

  function safeParseDate(dateStr: string): Date {
    // Handle both 'YYYY-MM-DD' and full ISO strings
    return dateStr.length === 10 ? new Date(dateStr + 'T00:00:00') : parseISO(dateStr);
  }

  function getSprintForDate(d: Date) {
    const dDay = startOfDay(d);
    for (let i = 0; i < sprints.length; i++) {
      const s = sprints[i]!;
      const start = startOfDay(safeParseDate(s.start_date));
      const end = startOfDay(safeParseDate(s.end_date));
      if (dDay >= start && dDay <= end) {
        return { ...s, colorIdx: i % SPRINT_BG.length };
      }
    }
    return null;
  }

  function getDeliverableForDate(d: Date) {
    const dateStr = format(d, 'yyyy-MM-dd');
    return deliverables.filter(dl => {
      const dlDate = dl.deadline.length > 10 ? format(safeParseDate(dl.deadline), 'yyyy-MM-dd') : dl.deadline;
      return dlDate === dateStr;
    });
  }

  // ── Render functions ─────────────────────────────────────

  function renderMonthGrid(baseDate: Date, compact = false) {
    const mStart = startOfMonth(baseDate);
    const mEnd = endOfMonth(baseDate);
    const calStart = startOfWeek(mStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(mEnd, { weekStartsOn: 1 });

    const weeks: Date[][] = [];
    let day = calStart;
    while (day <= calEnd) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) { week.push(day); day = addDays(day, 1); }
      weeks.push(week);
    }

    return (
      <div className={compact ? '' : ''}>
        {!compact && (
          <div className="text-center text-sm font-semibold mb-2">
            {format(baseDate, 'MMMM yyyy', { locale: tr })}
          </div>
        )}
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {WEEKDAYS.map(wd => (
              <div key={wd} className="py-1.5 text-center text-[10px] font-medium text-muted-foreground uppercase">{wd}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b last:border-0">
              {week.map(d => {
                const dateStr = format(d, 'yyyy-MM-dd');
                const dayEvents = getEventsForDate(d);
                const dayDeliverables = getDeliverableForDate(d);
                const sprint = getSprintForDate(d);
                const inMonth = isSameMonth(d, baseDate);
                const today = isToday(d);
                const totalItems = dayEvents.length + dayDeliverables.length;
                const maxVisible = compact ? 1 : 2;
                const isExpanded = expandedDays.has(dateStr);
                const hasOverflow = totalItems > maxVisible;

                return (
                  <div
                    key={dateStr}
                    className={cn(
                      'p-1 border-r last:border-0 cursor-pointer hover:bg-accent/30 transition-all',
                      !isExpanded && (compact ? 'min-h-[70px]' : 'min-h-[110px]'),
                      !inMonth && 'bg-muted/10',
                      today && !sprint && 'bg-primary/5',
                      sprint && SPRINT_BG[sprint.colorIdx]?.bg,
                    )}
                    onClick={() => {
                      setForm(f => ({ ...f, start_date: dateStr, end_date: dateStr }));
                      setCreateOpen(true);
                    }}
                  >
                    {/* Sprint label on first day of sprint */}
                    {sprint && format(safeParseDate(sprint.start_date), 'yyyy-MM-dd') === dateStr && !compact && (
                      <div className="text-[7px] font-medium truncate -mx-1 px-1 py-0.5 rounded-t" style={{ color: ['#3b82f6','#a855f7','#f59e0b','#22c55e'][sprint.colorIdx] }}>
                        {sprint.name.split('—')[0]?.trim()}
                      </div>
                    )}
                    <span className={cn(
                      'text-[11px] w-5 h-5 flex items-center justify-center rounded-full',
                      today && 'bg-primary text-primary-foreground font-bold',
                      !inMonth && 'text-muted-foreground/30',
                    )}>
                      {format(d, 'd')}
                    </span>
                    <div className="space-y-0.5 mt-0.5">
                      {dayDeliverables.slice(0, isExpanded ? undefined : maxVisible).map((dl, i) => (
                        <div key={`dl-${i}`} className="text-[8px] truncate rounded px-0.5 py-0.5 bg-amber-500/20 text-amber-600" title={`${dl.deliverable_number}: ${dl.title}`}>
                          {compact ? dl.deliverable_number : `${dl.deliverable_number}: ${dl.title}`}
                        </div>
                      ))}
                      {dayEvents.slice(0, isExpanded ? undefined : Math.max(0, maxVisible - dayDeliverables.length)).map(ev => (
                        <button
                          key={ev.id}
                          type="button"
                          className="w-full text-left text-[8px] truncate rounded px-0.5 py-0.5"
                          style={{ backgroundColor: ev.color + '20', color: ev.color }}
                          onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                        >
                          {ev.title}
                        </button>
                      ))}
                      {/* Expand/collapse toggle */}
                      {hasOverflow && !isExpanded && (
                        <button
                          type="button"
                          className="text-[7px] text-primary hover:underline pl-0.5"
                          onClick={e => {
                            e.stopPropagation();
                            setExpandedDays(prev => new Set(prev).add(dateStr));
                          }}
                        >
                          +{totalItems - maxVisible} more
                        </button>
                      )}
                      {isExpanded && hasOverflow && (
                        <button
                          type="button"
                          className="text-[7px] text-muted-foreground hover:underline pl-0.5"
                          onClick={e => {
                            e.stopPropagation();
                            setExpandedDays(prev => { const n = new Set(prev); n.delete(dateStr); return n; });
                          }}
                        >
                          show less
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderWeekView() {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {days.map(d => (
            <div key={d.toISOString()} className={cn(
              'py-2 text-center border-r last:border-0',
              isToday(d) && 'bg-primary/5',
            )}>
              <div className="text-[10px] text-muted-foreground uppercase">{format(d, 'EEE', { locale: tr })}</div>
              <div className={cn(
                'text-sm font-medium mt-0.5',
                isToday(d) && 'text-primary font-bold',
              )}>
                {format(d, 'd MMM', { locale: tr })}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map(d => {
            const dayEvents = getEventsForDate(d);
            const dayDeliverables = getDeliverableForDate(d);
            const sprint = getSprintForDate(d);

            return (
              <div
                key={d.toISOString()}
                className={cn(
                  'min-h-[200px] p-1.5 border-r last:border-0 cursor-pointer hover:bg-accent/30',
                  sprint && SPRINT_BG[sprint.colorIdx]?.bg,
                )}
                onClick={() => {
                  setForm(f => ({ ...f, start_date: format(d, 'yyyy-MM-dd'), end_date: format(d, 'yyyy-MM-dd') }));
                  setCreateOpen(true);
                }}
              >
                {sprint && format(safeParseDate(sprint.start_date), 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd') && (
                  <div className="text-[8px] font-medium truncate mb-1" style={{ color: ['#3b82f6','#a855f7','#f59e0b','#22c55e'][sprint.colorIdx] }}>
                    {sprint.name.split('—')[0]?.trim()} starts
                  </div>
                )}
                <div className="space-y-1">
                  {dayDeliverables.map((dl, i) => (
                    <div key={i} className="text-[9px] rounded px-1.5 py-0.5 bg-amber-500/20 text-amber-600 truncate">
                      {dl.deliverable_number}: {dl.title}
                    </div>
                  ))}
                  {dayEvents.map(ev => (
                    <button
                      key={ev.id}
                      type="button"
                      className="w-full text-left text-[9px] rounded px-1.5 py-0.5 truncate"
                      style={{ backgroundColor: ev.color + '20', color: ev.color }}
                      onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                    >
                      {!ev.all_day && <span className="font-medium">{format(parseISO(ev.start_time), 'HH:mm')} </span>}
                      {ev.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderDayView() {
    const d = startOfDay(currentDate);
    const dayEvents = getEventsForDate(d);
    const dayDeliverables = getDeliverableForDate(d);

    // Hours 08:00 - 22:00
    const hours = Array.from({ length: 15 }, (_, i) => i + 8);

    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="p-3 border-b bg-muted/30 text-center">
          <div className="text-sm font-semibold">{format(d, 'EEEE, d MMMM yyyy', { locale: tr })}</div>
        </div>
        <div>
          {dayDeliverables.length > 0 && (
            <div className="p-2 border-b space-y-1">
              {dayDeliverables.map((dl, i) => (
                <div key={i} className="text-xs rounded px-2 py-1 bg-amber-500/20 text-amber-600">
                  📅 {dl.deliverable_number}: {dl.title}
                </div>
              ))}
            </div>
          )}
          {hours.map(h => {
            const hourEvents = dayEvents.filter(ev => {
              const evHour = parseISO(ev.start_time).getHours();
              return evHour === h;
            });

            return (
              <div key={h} className="flex border-b last:border-0 min-h-[48px]">
                <div className="w-16 shrink-0 text-[11px] text-muted-foreground p-2 border-r text-right">
                  {String(h).padStart(2, '0')}:00
                </div>
                <div
                  className="flex-1 p-1 space-y-0.5 cursor-pointer hover:bg-accent/30"
                  onClick={() => {
                    setForm(f => ({
                      ...f,
                      start_date: format(d, 'yyyy-MM-dd'),
                      end_date: format(d, 'yyyy-MM-dd'),
                      start_time: `${String(h).padStart(2, '0')}:00`,
                      end_time: `${String(h + 1).padStart(2, '0')}:00`,
                    }));
                    setCreateOpen(true);
                  }}
                >
                  {hourEvents.map(ev => (
                    <button
                      key={ev.id}
                      type="button"
                      className="w-full text-left text-xs rounded px-2 py-1 truncate"
                      style={{ backgroundColor: ev.color + '20', color: ev.color }}
                      onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                    >
                      <span className="font-medium">{format(parseISO(ev.start_time), 'HH:mm')}</span> {ev.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const viewLabel = view === 'month'
    ? format(currentDate, 'MMMM yyyy', { locale: tr })
    : view === '3month'
      ? `${format(currentDate, 'MMM', { locale: tr })} — ${format(addMonths(currentDate, 2), 'MMM yyyy', { locale: tr })}`
      : view === 'week'
        ? `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM', { locale: tr })} — ${format(addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), 6), 'd MMM yyyy', { locale: tr })}`
        : format(currentDate, 'd MMMM yyyy', { locale: tr });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">Team events, meetings, sprint milestones, and deadlines.</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus size={15} className="mr-1.5" />
          New Event
        </Button>
      </div>

      {/* Navigation + View Switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
            <ChevronRight size={16} />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
          <h2 className="text-sm font-semibold ml-2">{viewLabel}</h2>
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          {(['day', 'week', 'month', '3month'] as ViewMode[]).map(v => (
            <Button
              key={v}
              variant={view === v ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setView(v)}
            >
              {v === '3month' ? '3 Months' : v.charAt(0).toUpperCase() + v.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      {view === 'month' && renderMonthGrid(currentDate)}
      {view === '3month' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map(offset => renderMonthGrid(addMonths(currentDate, offset), true))}
        </div>
      )}
      {view === 'week' && renderWeekView()}
      {view === 'day' && renderDayView()}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[10px] text-muted-foreground">
        {sprints.slice(0, 4).map((s, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className={cn('w-4 h-2 rounded-sm border', SPRINT_BG[i % SPRINT_BG.length]?.bg)} />
            {s.name.split('—')[0]?.trim()}
          </span>
        ))}
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500" /> Deliverable</span>
      </div>

      {/* Event Detail Modal */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ backgroundColor: selectedEvent?.color }} />
              {selectedEvent?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock size={14} />
                {selectedEvent.all_day
                  ? format(parseISO(selectedEvent.start_time), 'd MMMM yyyy', { locale: tr })
                  : `${format(parseISO(selectedEvent.start_time), 'd MMM HH:mm', { locale: tr })}${selectedEvent.end_time ? ` — ${format(parseISO(selectedEvent.end_time), 'HH:mm')}` : ''}`}
              </div>
              {selectedEvent.location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin size={14} />
                  {selectedEvent.location}
                </div>
              )}
              {selectedEvent.description && (
                <p className="text-sm text-muted-foreground">{selectedEvent.description}</p>
              )}
              {selectedEvent.attendees && selectedEvent.attendees.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users size={12} />
                    Attendees
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedEvent.attendees.map(a => (
                      <Badge key={a.user_id} variant="secondary" className="text-[10px]">
                        {(a.user as { full_name: string } | null)?.full_name ?? 'Unknown'}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                <span>Created by {(selectedEvent.creator as { full_name: string } | null)?.full_name ?? 'Unknown'}</span>
                <Badge variant="outline" className="text-[9px]">{selectedEvent.event_type}</Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="destructive" size="sm" onClick={() => selectedEvent && handleDelete(selectedEvent.id)}>
              <Trash2 size={13} className="mr-1" />
              Delete
            </Button>
            <Button variant="outline" onClick={() => setSelectedEvent(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Event Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input placeholder="Team meeting, deadline reminder..." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="Agenda, notes..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="resize-none min-h-[60px]" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.all_day} onCheckedChange={v => setForm(f => ({ ...f, all_day: v }))} />
              <Label>All day</Label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <DatePicker
                  value={form.start_date || undefined}
                  onChange={d => setForm(f => ({ ...f, start_date: d ?? '' }))}
                  placeholder="Select date"
                  className="w-full"
                />
              </div>
              {!form.all_day && (
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <TimePicker
                    value={form.start_time || undefined}
                    onChange={t => setForm(f => ({ ...f, start_time: t ?? '' }))}
                    placeholder="Select time"
                    className="w-full"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>End Date (optional)</Label>
                <DatePicker
                  value={form.end_date || undefined}
                  onChange={d => setForm(f => ({ ...f, end_date: d ?? '' }))}
                  placeholder="Select date"
                  className="w-full"
                />
              </div>
              {!form.all_day && (
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <TimePicker
                    value={form.end_time || undefined}
                    onChange={t => setForm(f => ({ ...f, end_time: t ?? '' }))}
                    placeholder="Select time"
                    className="w-full"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.event_type} onValueChange={v => setForm(f => ({ ...f, event_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="deadline">Deadline</SelectItem>
                    <SelectItem value="reminder">Reminder</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-1.5 pt-1">
                  {EVENT_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      className={cn('size-6 rounded-full transition-all', form.color === c.value && 'ring-2 ring-offset-2 ring-primary')}
                      style={{ backgroundColor: c.value }}
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input placeholder="Room, link, or address" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Reminder</Label>
                <Select value={form.reminder_minutes} onValueChange={v => setForm(f => ({ ...f, reminder_minutes: v }))}>
                  <SelectTrigger><SelectValue placeholder="No reminder" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No reminder</SelectItem>
                    {REMINDER_OPTIONS.map(r => (
                      <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Recurrence</Label>
                <Select value={form.recurrence || 'none'} onValueChange={v => setForm(f => ({ ...f, recurrence: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="No repeat" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No repeat</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Biweekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Attendees</Label>
              <div className="space-y-1.5">
                {team.map(m => (
                  <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={form.attendees.includes(m.id)}
                      onCheckedChange={checked => {
                        setForm(f => ({
                          ...f,
                          attendees: checked
                            ? [...f.attendees, m.id]
                            : f.attendees.filter(id => id !== m.id),
                        }));
                      }}
                    />
                    {m.full_name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !form.title.trim() || !form.start_date}>
              {creating ? 'Creating...' : 'Create Event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
