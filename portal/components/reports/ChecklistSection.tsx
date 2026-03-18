'use client';

import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ChecklistItem } from '@/types';

interface ChecklistSectionProps {
  deliverableId: string;
  items: ChecklistItem[];
  onUpdate: () => void;
}

export function ChecklistSection({ deliverableId, items, onUpdate }: ChecklistSectionProps) {
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleToggle(item: ChecklistItem) {
    const res = await fetch(`/api/reports/${deliverableId}/checklist/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_checked: !item.is_checked }),
    });
    if (!res.ok) {
      toast.error('Failed to update item');
      return;
    }
    onUpdate();
  }

  async function handleAdd() {
    if (!newLabel.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/reports/${deliverableId}/checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel }),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error('Failed to add item');
      return;
    }
    setNewLabel('');
    onUpdate();
  }

  async function handleEdit(itemId: string) {
    if (!editLabel.trim()) return;
    const res = await fetch(`/api/reports/${deliverableId}/checklist/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: editLabel }),
    });
    if (!res.ok) {
      toast.error('Failed to update item');
      return;
    }
    setEditingId(null);
    onUpdate();
  }

  async function handleDelete(itemId: string) {
    const res = await fetch(`/api/reports/${deliverableId}/checklist/${itemId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast.error('Failed to delete item');
      return;
    }
    onUpdate();
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Checklist</h3>

      <div className="space-y-1">
        {items.map(item => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 group"
          >
            <Checkbox
              checked={item.is_checked}
              onCheckedChange={() => handleToggle(item)}
            />

            {editingId === item.id ? (
              <div className="flex-1 flex items-center gap-1">
                <Input
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleEdit(item.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="h-7 text-sm"
                  autoFocus
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(item.id)}>
                  <Check size={14} />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                  <X size={14} />
                </Button>
              </div>
            ) : (
              <>
                <span className={`flex-1 text-sm ${item.is_checked ? 'line-through text-muted-foreground' : ''}`}>
                  {item.label}
                </span>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => { setEditingId(item.id); setEditLabel(item.label); }}
                  >
                    <Pencil size={13} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add new item */}
      <div className="flex items-center gap-2 pt-1">
        <Input
          placeholder="Add checklist item..."
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          className="h-8 text-sm"
        />
        <Button size="sm" variant="outline" onClick={handleAdd} disabled={loading || !newLabel.trim()}>
          <Plus size={14} className="mr-1" />
          Add
        </Button>
      </div>
    </div>
  );
}
