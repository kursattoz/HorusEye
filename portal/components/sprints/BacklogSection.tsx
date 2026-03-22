'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BacklogItemCard } from './BacklogItemCard';
import type { BacklogItem, BacklogPriority, DevRole } from '@/types';

const DEV_ROLES: { value: DevRole; label: string }[] = [
  { value: 'product_owner', label: 'Product Owner' },
  { value: 'portal_frontend', label: 'Portal Frontend' },
  { value: 'portal_backend', label: 'Portal Backend' },
  { value: 'ai_backend', label: 'AI Backend' },
  { value: 'fullstack', label: 'Fullstack' },
  { value: 'project_coordinator', label: 'Project Coordinator' },
];

const PRIORITIES: { value: BacklogPriority; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const PRD_IDS = [
  'PRD-001', 'PRD-002', 'PRD-003', 'PRD-004', 'PRD-005', 'PRD-006',
  'PRD-007', 'PRD-008', 'PRD-009', 'PRD-010', 'PRD-011', 'PRD-012',
  'PRD-013', 'PRD-014', 'PRD-015', 'PRD-016', 'PRD-017', 'PRD-018',
];

interface BacklogSectionProps {
  onUpdate: () => void;
  sprints: { id: string; name: string }[];
}

type BacklogItemWithAssignee = BacklogItem & {
  assignee?: { full_name: string; avatar_url: string | null; dev_role: string | null } | null;
};

export function BacklogSection({ onUpdate, sprints }: BacklogSectionProps) {
  const [items, setItems] = useState<BacklogItemWithAssignee[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unassigned'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', prd_id: '', prd_section: '', epic: '',
    dev_role: '', priority: 'medium' as BacklogPriority, sprint_id: '',
  });

  async function fetchItems() {
    const res = await fetch('/api/backlog');
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect -- data fetching on mount */
  useEffect(() => { fetchItems(); }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleCreate() {
    if (!form.title.trim()) return;
    setCreating(true);
    const res = await fetch('/api/backlog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        prd_id: form.prd_id || null,
        prd_section: form.prd_section || null,
        epic: form.epic || null,
        dev_role: form.dev_role || null,
        sprint_id: form.sprint_id || null,
      }),
    });
    setCreating(false);
    if (!res.ok) { toast.error('Failed to create'); return; }
    setCreateOpen(false);
    setForm({ title: '', description: '', prd_id: '', prd_section: '', epic: '', dev_role: '', priority: 'medium', sprint_id: '' });
    fetchItems();
    onUpdate();
    toast.success('Backlog item created');
  }

  async function handleItemUpdate() {
    fetchItems();
    onUpdate();
  }

  const unassignedCount = items.filter(i => !i.sprint_id).length;
  const filteredItems = filter === 'unassigned' ? items.filter(i => !i.sprint_id) : items;

  // Group by sprint
  const grouped = new Map<string, { name: string; items: BacklogItemWithAssignee[] }>();
  grouped.set('_unassigned', { name: 'No Sprint', items: [] });
  for (const s of sprints) {
    grouped.set(s.id, { name: s.name.split('—')[0]?.trim() ?? s.name, items: [] });
  }
  for (const item of filteredItems) {
    const key = item.sprint_id ?? '_unassigned';
    if (!grouped.has(key)) grouped.set(key, { name: 'Unknown Sprint', items: [] });
    grouped.get(key)!.items.push(item);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button type="button" className="flex items-center gap-2" onClick={() => setCollapsed(c => !c)}>
            <ChevronRight
              size={14}
              className={cn('text-muted-foreground transition-transform', !collapsed && 'rotate-90')}
            />
            <h2 className="text-sm font-semibold text-muted-foreground">All Backlog Items</h2>
            <Badge variant="secondary" className="text-[10px]">{filteredItems.length}</Badge>
          </button>
          {/* Filter toggle */}
          <div className="flex items-center gap-1 border rounded-md p-0.5">
            <Button
              variant={filter === 'all' ? 'default' : 'ghost'}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setFilter('all')}
            >
              All ({items.length})
            </Button>
            <Button
              variant={filter === 'unassigned' ? 'default' : 'ghost'}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setFilter('unassigned')}
            >
              No Sprint ({unassignedCount})
            </Button>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1" />
          Add Item
        </Button>
      </div>

      {!collapsed && (
        <div className="space-y-4">
          {filteredItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No backlog items. Create one to get started.</p>
          ) : (
            Array.from(grouped.entries())
              .filter(([, g]) => g.items.length > 0)
              .map(([key, group]) => (
                <div key={key}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={cn(
                      'text-xs font-medium',
                      key === '_unassigned' ? 'text-amber-600' : 'text-muted-foreground',
                    )}>
                      {group.name}
                    </span>
                    <Badge variant="secondary" className="text-[9px]">{group.items.length}</Badge>
                    {key === '_unassigned' && (
                      <Badge variant="outline" className="text-[8px] border-amber-500/30 text-amber-600">needs sprint</Badge>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map(item => (
                      <BacklogItemCard
                        key={item.id}
                        item={item}
                        sprints={sprints}
                        onUpdate={handleItemUpdate}
                      />
                    ))}
                  </div>
                </div>
              ))
          )}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Backlog Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="Implement login page..."
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Details, acceptance criteria..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="resize-none min-h-[80px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PRD Reference</Label>
                <Select value={form.prd_id} onValueChange={v => setForm(f => ({ ...f, prd_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select PRD" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {PRD_IDS.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>PRD Section</Label>
                <Input
                  placeholder="e.g. 3.2 WebSocket"
                  value={form.prd_section}
                  onChange={e => setForm(f => ({ ...f, prd_section: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Epic</Label>
              <Input
                placeholder="e.g. Camera MVP, Auth Polish, Exam CRUD"
                value={form.epic}
                onChange={e => setForm(f => ({ ...f, epic: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Dev Role</Label>
                <Select value={form.dev_role} onValueChange={v => setForm(f => ({ ...f, dev_role: v }))}>
                  <SelectTrigger><SelectValue placeholder="Auto-assign by role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {DEV_ROLES.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as BacklogPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sprint (optional)</Label>
              <Select value={form.sprint_id} onValueChange={v => setForm(f => ({ ...f, sprint_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Backlog (no sprint)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Backlog (no sprint)</SelectItem>
                  {sprints.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !form.title.trim()}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
