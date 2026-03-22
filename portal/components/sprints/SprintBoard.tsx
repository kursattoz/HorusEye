'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Calendar, Target, ChevronRight, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { routes } from '@/constants/routes';
import type { SprintStatus } from '@/types';
import { BacklogSection } from './BacklogSection';

interface SprintRow {
  id: string;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  status: SprintStatus;
  item_count: number;
  done_count: number;
}

const STATUS_COLORS: Record<SprintStatus, string> = {
  planning: 'bg-muted text-muted-foreground',
  active: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
};

export function SprintBoard() {
  const router = useRouter();
  const [sprints, setSprints] = useState<SprintRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', goal: '', start_date: '', end_date: '' });
  const [creating, setCreating] = useState(false);

  async function fetchSprints() {
    const res = await fetch('/api/sprints');
    if (res.ok) {
      const data = await res.json();
      setSprints(data.sprints ?? []);
    }
    setLoading(false);
  }

  /* eslint-disable react-hooks/set-state-in-effect -- data fetching on mount */
  useEffect(() => { fetchSprints(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleCreate() {
    if (!form.name.trim() || !form.start_date || !form.end_date) return;
    setCreating(true);
    const res = await fetch('/api/sprints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setCreating(false);
    if (!res.ok) { toast.error('Failed to create sprint'); return; }
    setCreateOpen(false);
    setForm({ name: '', goal: '', start_date: '', end_date: '' });
    fetchSprints();
    toast.success('Sprint created');
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>;
  }

  const activeSprints = sprints.filter(s => s.status === 'active');
  const planningSprints = sprints.filter(s => s.status === 'planning');
  const completedSprints = sprints.filter(s => s.status === 'completed');

  return (
    <div className="space-y-8">
      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={15} className="mr-1.5" />
          New Sprint
        </Button>
        <Button variant="outline" onClick={() => router.push('/sprints/analytics')}>
          <BarChart3 size={15} className="mr-1.5" />
          Project Analytics
        </Button>
      </div>

      {/* Active sprints */}
      {activeSprints.length > 0 && (
        <SprintGroup title="Active" sprints={activeSprints} router={router} />
      )}

      {/* Planning sprints */}
      {planningSprints.length > 0 && (
        <SprintGroup title="Planning" sprints={planningSprints} router={router} />
      )}

      {/* Backlog (items not in any sprint) */}
      <BacklogSection onUpdate={fetchSprints} sprints={sprints} />

      {/* Completed sprints */}
      {completedSprints.length > 0 && (
        <SprintGroup title="Completed" sprints={completedSprints} router={router} defaultCollapsed />
      )}

      {/* Create Sprint Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Sprint</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="Sprint 1"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Goal (optional)</Label>
              <Textarea
                placeholder="What should this sprint achieve?"
                value={form.goal}
                onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
                className="resize-none min-h-[60px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <DatePicker
                  value={form.start_date || undefined}
                  onChange={d => setForm(f => ({ ...f, start_date: d ?? '' }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <DatePicker
                  value={form.end_date || undefined}
                  onChange={d => setForm(f => ({ ...f, end_date: d ?? '' }))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !form.name.trim()}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Sprint group section ──────────────────────────────────── */

function SprintGroup({
  title,
  sprints,
  router,
  defaultCollapsed = false,
}: {
  title: string;
  sprints: SprintRow[];
  router: ReturnType<typeof useRouter>;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section>
      <button
        type="button"
        className="flex items-center gap-2 mb-3"
        onClick={() => setCollapsed(c => !c)}
      >
        <ChevronRight
          size={14}
          className={cn('text-muted-foreground transition-transform', !collapsed && 'rotate-90')}
        />
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        <Badge variant="secondary" className="text-[10px]">{sprints.length}</Badge>
      </button>

      {!collapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {sprints.map(s => {
            const progress = s.item_count > 0
              ? Math.round((s.done_count / s.item_count) * 100)
              : 0;
            const now = new Date();
            const end = new Date(s.end_date);
            const isOverdue = end < now && s.status !== 'completed';

            return (
              <button
                key={s.id}
                onClick={() => router.push(routes.sprintDetail(s.id))}
                className="text-left border rounded-lg p-4 space-y-3 transition-all hover:bg-muted/50 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium">{s.name}</h3>
                    {s.goal && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.goal}</p>
                    )}
                  </div>
                  <Badge className={cn('shrink-0 text-[10px]', STATUS_COLORS[s.status])}>
                    {s.status}
                  </Badge>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {new Date(s.start_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                    {' — '}
                    {new Date(s.end_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                  </span>
                  {isOverdue && <span className="text-destructive font-medium">Overdue</span>}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Target size={11} />
                      Items
                    </span>
                    <span>{s.done_count}/{s.item_count} ({progress}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        s.status === 'completed' ? 'bg-green-500' : 'bg-primary',
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
