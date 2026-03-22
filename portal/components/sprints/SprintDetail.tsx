'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ArrowLeft, Calendar, Target, Settings2, Filter, GitBranch, BarChart3, AlertTriangle, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { routes } from '@/constants/routes';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { BacklogItemCard } from './BacklogItemCard';
import type { Sprint, BacklogItem, BacklogStatus, SprintStatus } from '@/types';

type ItemWithAssignee = BacklogItem & {
  assignee?: { full_name: string; avatar_url: string | null; dev_role: string | null } | null;
  backlog_attachments?: { id: string; file_name: string; file_url: string; file_type: string }[];
};

const KANBAN_COLUMNS: { status: BacklogStatus; label: string; color: string }[] = [
  { status: 'backlog', label: 'Backlog', color: 'border-t-muted-foreground/40' },
  { status: 'todo', label: 'To Do', color: 'border-t-amber-500' },
  { status: 'in_progress', label: 'In Progress', color: 'border-t-blue-500' },
  { status: 'review', label: 'Review', color: 'border-t-purple-500' },
  { status: 'done', label: 'Done', color: 'border-t-green-500' },
];

const STATUS_OPTIONS: { value: SprintStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

export function SprintDetail({ sprintId }: { sprintId: string }) {
  const router = useRouter();
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [items, setItems] = useState<ItemWithAssignee[]>([]);
  const [allSprints, setAllSprints] = useState<{ id: string; name: string }[]>([]);
  const [filterUser, setFilterUser] = useState<string>('_pending'); // _pending = wait for auth
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<BacklogStatus | null>(null);
  const [blockerModal, setBlockerModal] = useState<{
    error: string; itemId: string;
    blocker?: { seq_id: number; title: string; status: string; priority: string; prd_id: string | null; assignee_name: string | null };
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ name: '', goal: '', start_date: '', end_date: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const [sprintRes, sprintsRes] = await Promise.all([
      fetch(`/api/sprints/${sprintId}`),
      fetch('/api/sprints'),
    ]);
    if (sprintRes.ok) {
      const data = await sprintRes.json();
      setSprint(data.sprint);
      setItems(data.items ?? []);
    }
    if (sprintsRes.ok) {
      const data = await sprintsRes.json();
      setAllSprints(data.sprints ?? []);
    }
  }, [sprintId]);

  // Fetch current user and set as default filter
  async function fetchMe() {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      const userId = data.user?.id as string | undefined;
      if (userId) {
        setCurrentUserId(userId);
        setFilterUser(userId);
      } else {
        setFilterUser('all');
      }
    } else {
      setFilterUser('all');
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect -- data fetching on mount */
  useEffect(() => { fetchData(); fetchMe(); }, [fetchData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Optimistic drag-drop: update local state immediately, then sync
  async function handleDrop(itemId: string, newStatus: BacklogStatus) {
    const draggedItem = items.find(i => i.id === itemId);
    if (!draggedItem || draggedItem.status === newStatus) return;

    // Optimistic update
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, status: newStatus } : i
    ));

    const res = await fetch(`/api/backlog/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });

    if (res.ok) {
      toast.success(`Moved to ${KANBAN_COLUMNS.find(c => c.status === newStatus)?.label}`);
      fetchData(); // Sync with server
    } else {
      // Revert
      setItems(prev => prev.map(i =>
        i.id === itemId ? { ...i, status: draggedItem.status } : i
      ));
      const err = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setBlockerModal({ error: err.error ?? 'Blocked by dependency', itemId, blocker: err.blocker });
      } else if (res.status === 422) {
        toast.error(err.error ?? 'Review required before marking as done');
      } else {
        toast.error(err.error ?? 'Move failed');
      }
    }
  }

  async function updateSprintStatus(status: string) {
    const res = await fetch(`/api/sprints/${sprintId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) { toast.error('Failed to update'); return; }
    toast.success(status === 'completed' ? 'Sprint completed. Unfinished items moved to backlog.' : 'Sprint updated');
    fetchData();
  }

  function openSettings() {
    if (!sprint) return;
    setSettingsForm({
      name: sprint.name,
      goal: sprint.goal ?? '',
      start_date: sprint.start_date,
      end_date: sprint.end_date,
    });
    setSettingsOpen(true);
  }

  async function handleSaveSettings() {
    setSaving(true);
    const res = await fetch(`/api/sprints/${sprintId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsForm),
    });
    setSaving(false);
    if (!res.ok) { toast.error('Failed to save'); return; }
    setSettingsOpen(false);
    fetchData();
    toast.success('Sprint updated');
  }

  if (!sprint || filterUser === '_pending') {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>;
  }

  // Unique assignees for filter
  const assignees = new Map<string, string>();
  for (const item of items) {
    if (item.assignee && item.assigned_to) {
      assignees.set(item.assigned_to, item.assignee.full_name);
    }
  }

  const filteredItems = filterUser === 'all'
    ? items
    : filterUser === 'unassigned'
      ? items.filter(i => !i.assigned_to)
      : filterUser === 'my_reviews'
        ? items.filter(i => i.reviewer_id === currentUserId)
        : items.filter(i => i.assigned_to === filterUser);

  const totalItems = items.length;
  const doneItems = items.filter(i => i.status === 'done').length;
  const progress = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const isFilteredToSelf = filterUser === currentUserId;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => router.push(routes.sprints)}>
            <ArrowLeft size={18} />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">{sprint.name}</h1>
            {sprint.goal && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sprint.goal}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => router.push(`/sprints/${sprintId}/analytics`)}
                  >
                    <BarChart3 size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Analytics &amp; Performance</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => router.push(`/sprints/${sprintId}/dependencies`)}
                  >
                    <GitBranch size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Dependency Graph</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={openSettings}
                  >
                    <Settings2 size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sprint Settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Select value={sprint.status} onValueChange={updateSprintStatus}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Meta + filter row */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {new Date(sprint.start_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
              {' — '}
              {new Date(sprint.end_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
            </span>
            <span className="flex items-center gap-1">
              <Target size={12} />
              {doneItems}/{totalItems} ({progress}%)
            </span>
          </div>

          {/* User filter with glow */}
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-muted-foreground" />
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger
                className={cn(
                  'h-7 text-xs w-40 transition-shadow',
                  isFilteredToSelf && 'animate-glow-border',
                )}
              >
                <SelectValue placeholder="All members" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All members</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <SelectItem value="my_reviews">My Reviews</SelectItem>
                {Array.from(assignees.entries()).map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}{id === currentUserId ? ' (me)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Kanban columns — horizontal scroll on small screens, drag-and-drop */}
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2 snap-x">
        {KANBAN_COLUMNS.map(col => {
          const colItems = filteredItems.filter(i => i.status === col.status);
          const isOver = dragOverCol === col.status;
          return (
            <div
              key={col.status}
              className={cn(
                'border rounded-lg border-t-4 p-2.5 space-y-2 shrink-0 w-[280px] lg:w-auto lg:flex-1 snap-start transition-colors',
                col.color,
                isOver && 'bg-primary/5 border-primary/30 ring-2 ring-primary/20',
              )}
              onDragOver={e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverCol(col.status);
              }}
              onDragLeave={e => {
                // Only clear if leaving the column itself, not entering a child
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverCol(null);
                }
              }}
              onDrop={e => {
                e.preventDefault();
                setDragOverCol(null);
                const itemId = e.dataTransfer.getData('text/plain');
                if (itemId) handleDrop(itemId, col.status);
              }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{col.label}</h3>
                <Badge variant="secondary" className="text-[10px]">{colItems.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[60px]">
                {colItems.map(item => (
                  <BacklogItemCard
                    key={item.id}
                    item={item}
                    sprints={allSprints}
                    onUpdate={fetchData}
                    compact
                    draggable
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Blocker Modal */}
      <Dialog open={!!blockerModal} onOpenChange={() => setBlockerModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={18} />
              Blocked
            </DialogTitle>
          </DialogHeader>
          {blockerModal?.blocker ? (
            <div className="space-y-3">
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-muted-foreground">BL-{blockerModal.blocker.seq_id}</span>
                  <Badge variant="secondary" className="text-[10px]">{blockerModal.blocker.status.replace('_', ' ')}</Badge>
                </div>
                <p className="text-sm font-medium">{blockerModal.blocker.title}</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Assigned to</span>
                    <p className="font-medium text-foreground">{blockerModal.blocker.assignee_name ?? 'Unassigned'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Priority</span>
                    <p className="font-medium text-foreground capitalize">{blockerModal.blocker.priority}</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This task must be completed before you can proceed. Request Unblock will notify the assignee via in-app notification and email.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{blockerModal?.error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockerModal(null)}>Close</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (blockerModal?.itemId) {
                  await fetch(`/api/backlog/${blockerModal.itemId}/request-unblock`, { method: 'POST' });
                  toast.success('Unblock request sent');
                }
                setBlockerModal(null);
              }}
            >
              <BellRing size={14} className="mr-1.5" />
              Request Unblock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sprint Settings Modal */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sprint Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={settingsForm.name}
                onChange={e => setSettingsForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Goal</Label>
              <Textarea
                value={settingsForm.goal}
                onChange={e => setSettingsForm(f => ({ ...f, goal: e.target.value }))}
                className="resize-none min-h-[60px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <DatePicker
                  value={settingsForm.start_date || undefined}
                  onChange={d => setSettingsForm(f => ({ ...f, start_date: d ?? '' }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <DatePicker
                  value={settingsForm.end_date || undefined}
                  onChange={d => setSettingsForm(f => ({ ...f, end_date: d ?? '' }))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
