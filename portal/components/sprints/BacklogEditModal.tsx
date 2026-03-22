'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { BacklogItem, BacklogPriority, BacklogStatus, DevRole } from '@/types';

interface BacklogEditModalProps {
  item: BacklogItem | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  team: { id: string; full_name: string }[];
}

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

const STATUSES: { value: BacklogStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
];

const PRD_IDS = [
  'PRD-001', 'PRD-002', 'PRD-003', 'PRD-004', 'PRD-005', 'PRD-006',
  'PRD-007', 'PRD-008', 'PRD-009', 'PRD-010', 'PRD-011', 'PRD-012',
  'PRD-013', 'PRD-014', 'PRD-015', 'PRD-016', 'PRD-017', 'PRD-018',
];

export function BacklogEditModal({ item, open, onClose, onSaved, team }: BacklogEditModalProps) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    prd_id: '',
    prd_section: '',
    epic: '',
    dev_role: '',
    assigned_to: '',
    reviewer_id: '',
    priority: 'medium' as BacklogPriority,
    status: 'backlog' as BacklogStatus,
    estimated_hours: '',
    actual_hours: '',
  });
  const [saving, setSaving] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- sync form from prop */
  useEffect(() => {
    if (item) {
      setForm({
        title: item.title,
        description: item.description ?? '',
        prd_id: item.prd_id ?? '',
        prd_section: item.prd_section ?? '',
        epic: item.epic ?? '',
        dev_role: item.dev_role ?? '',
        assigned_to: item.assigned_to ?? '',
        reviewer_id: item.reviewer_id ?? '',
        priority: item.priority,
        status: item.status,
        estimated_hours: item.estimated_hours?.toString() ?? '',
        actual_hours: item.actual_hours?.toString() ?? '',
      });
    }
  }, [item]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSave() {
    if (!item || !form.title.trim()) return;
    setSaving(true);

    const body: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      prd_id: form.prd_id || null,
      prd_section: form.prd_section || null,
      epic: form.epic || null,
      dev_role: form.dev_role || null,
      assigned_to: form.assigned_to || null,
      reviewer_id: form.reviewer_id || null,
      priority: form.priority,
      status: form.status,
      estimated_hours: form.estimated_hours ? parseInt(form.estimated_hours) : null,
      actual_hours: form.actual_hours ? parseFloat(form.actual_hours) : null,
    };

    const res = await fetch(`/api/backlog/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (!res.ok) { toast.error('Failed to save'); return; }
    toast.success('Item updated');
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Backlog Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="resize-none min-h-[80px]"
            />
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as BacklogStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
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

          {/* Assigned + Reviewer */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Assigned to</Label>
              <Select value={form.assigned_to || 'none'} onValueChange={v => setForm(f => ({ ...f, assigned_to: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {team.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reviewer</Label>
              <Select value={form.reviewer_id || 'none'} onValueChange={v => setForm(f => ({ ...f, reviewer_id: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="No reviewer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No reviewer</SelectItem>
                  {team.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* PRD + Section */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>PRD Reference</Label>
              <Select value={form.prd_id || 'none'} onValueChange={v => setForm(f => ({ ...f, prd_id: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
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

          {/* Epic + Dev Role */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Epic</Label>
              <Input
                placeholder="e.g. Camera MVP"
                value={form.epic}
                onChange={e => setForm(f => ({ ...f, epic: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Dev Role</Label>
              <Select value={form.dev_role || 'none'} onValueChange={v => setForm(f => ({ ...f, dev_role: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {DEV_ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Estimated Hours</Label>
              <Input
                type="number"
                min="0"
                value={form.estimated_hours}
                onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Actual Hours</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={form.actual_hours}
                onChange={e => setForm(f => ({ ...f, actual_hours: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.title.trim()}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
