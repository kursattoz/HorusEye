'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Plus, Pencil, Trash2, Check, X, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ChecklistItem } from '@/types';

interface ChecklistSectionProps {
  deliverableId: string;
  items: ChecklistItem[];
  onUpdate: () => void;
}

function formatRelative(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export function ChecklistSection({ deliverableId, items, onUpdate }: ChecklistSectionProps) {
  const [newLabel, setNewLabel] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showNewDescription, setShowNewDescription] = useState(false);

  // Optimistic state: overrides for items currently being toggled
  const [optimistic, setOptimistic] = useState<Map<string, boolean>>(new Map());
  // Track which items have in-flight API calls
  const inflightRef = useRef<Set<string>>(new Set());

  // Clear only resolved optimistic entries (server caught up), keep in-flight ones
  useEffect(() => {
    if (optimistic.size === 0) return;
    setOptimistic(prev => {
      const next = new Map<string, boolean>();
      for (const [id, val] of prev) {
        // Keep if still in-flight (API hasn't returned yet)
        if (inflightRef.current.has(id)) {
          next.set(id, val);
          continue;
        }
        // Keep if server hasn't caught up yet (value still differs)
        const serverItem = items.find(i => i.id === id);
        if (serverItem && serverItem.is_checked !== val) {
          next.set(id, val);
        }
        // Otherwise drop — server has the correct value
      }
      return next;
    });
  }, [items, optimistic.size]);

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const handleToggle = useCallback(async (item: ChecklistItem) => {
    // Determine new value: read current optimistic state via ref-like pattern
    let newVal: boolean;
    setOptimistic(prev => {
      const currentVal = prev.has(item.id) ? prev.get(item.id)! : item.is_checked;
      newVal = !currentVal;
      return new Map(prev).set(item.id, newVal);
    });
    inflightRef.current.add(item.id);

    // newVal is guaranteed to be set by the synchronous setState call above
    const targetVal = newVal!;

    try {
      const res = await fetch(`/api/reports/${deliverableId}/checklist/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_checked: targetVal }),
      });
      if (!res.ok) {
        toast.error('Failed to update item');
        setOptimistic(prev => {
          const next = new Map(prev);
          next.delete(item.id);
          return next;
        });
        inflightRef.current.delete(item.id);
        return;
      }
    } catch {
      setOptimistic(prev => {
        const next = new Map(prev);
        next.delete(item.id);
        return next;
      });
      inflightRef.current.delete(item.id);
      toast.error('Network error');
      return;
    }

    // Mark as no longer in-flight, then refresh server data
    inflightRef.current.delete(item.id);
    onUpdate();
  }, [deliverableId, onUpdate]);

  async function handleAdd() {
    if (!newLabel.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/reports/${deliverableId}/checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: newLabel,
        ...(newDescription.trim() ? { description: newDescription } : {}),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error('Failed to add item');
      return;
    }
    setNewLabel('');
    setNewDescription('');
    setShowNewDescription(false);
    onUpdate();
  }

  async function handleEdit(itemId: string) {
    if (!editLabel.trim()) return;
    const res = await fetch(`/api/reports/${deliverableId}/checklist/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: editLabel, description: editDescription }),
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
        {items.map(item => {
          const isChecked = optimistic.has(item.id) ? optimistic.get(item.id)! : item.is_checked;
          const hasDescription = !!item.description;
          const isExpanded = expandedIds.has(item.id);
          const hasDetail = hasDescription || item.checked_at;

          return (
            <Collapsible
              key={item.id}
              open={editingId === item.id || (!!hasDetail && isExpanded)}
              onOpenChange={() => {
                if (editingId !== item.id && hasDetail) toggleExpanded(item.id);
              }}
            >
              <div className="rounded-md hover:bg-muted/50 group">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  {/* Checkbox with smooth CSS animation */}
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => handleToggle(item)}
                    className={cn(
                      'transition-all duration-200 ease-out',
                      'hover:scale-110',
                      'active:scale-90',
                      isChecked && 'data-[state=checked]:bg-primary data-[state=checked]:border-primary',
                    )}
                  />

                  {editingId === item.id ? (
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-1">
                        <Input
                          value={editLabel}
                          onChange={e => setEditLabel(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) handleEdit(item.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="h-7 text-sm"
                          autoFocus
                          placeholder="Task name"
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => handleEdit(item.id)}>
                          <Check size={14} />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingId(null)}>
                          <X size={14} />
                        </Button>
                      </div>
                      <Textarea
                        value={editDescription}
                        onChange={e => setEditDescription(e.target.value)}
                        placeholder="Add description (optional)"
                        className="text-sm min-h-[60px] resize-none"
                        onKeyDown={e => {
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'flex-1 text-left text-sm flex items-center gap-1.5 transition-colors duration-150',
                            isChecked && 'line-through text-muted-foreground',
                          )}
                        >
                          {hasDetail && (
                            <ChevronRight
                              size={13}
                              className={cn(
                                'shrink-0 text-muted-foreground transition-transform duration-200',
                                isExpanded && 'rotate-90',
                              )}
                            />
                          )}
                          <span>{item.label}</span>
                        </button>
                      </CollapsibleTrigger>

                      {/* Timestamp badges inline */}
                      {item.checked_at && isChecked && (
                        <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap hidden sm:inline">
                          {formatRelative(item.checked_at)}
                        </span>
                      )}

                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditLabel(item.label);
                            setEditDescription(item.description ?? '');
                          }}
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

                {/* Expanded detail: description + timestamps */}
                {editingId !== item.id && hasDetail && (
                  <CollapsibleContent>
                    <div className="px-8 pb-2 space-y-1">
                      {item.description && (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {item.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground/60">
                        <span>Created {formatRelative(item.created_at)}</span>
                        {item.checked_at && (
                          <span>
                            {item.is_checked ? 'Completed' : 'Unchecked'} {formatRelative(item.checked_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                )}
              </div>
            </Collapsible>
          );
        })}
      </div>

      {/* Add new item */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Add checklist item..."
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleAdd(); }}
            className="h-8 text-sm"
          />
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground shrink-0"
            onClick={() => setShowNewDescription(prev => !prev)}
            type="button"
          >
            {showNewDescription ? 'Hide detail' : 'Add detail'}
          </Button>
          <Button size="sm" variant="outline" onClick={handleAdd} disabled={loading || !newLabel.trim()} className="shrink-0">
            <Plus size={14} className="mr-1" />
            Add
          </Button>
        </div>
        {showNewDescription && (
          <Textarea
            placeholder="Description / details (optional)"
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            className="text-sm min-h-[60px] resize-none"
          />
        )}
      </div>
    </div>
  );
}
