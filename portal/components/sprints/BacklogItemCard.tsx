'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Collapsible, CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, FileCode2, User, Paperclip, ChevronRight, ImagePlus, X, Ban, Pencil, BellRing, AlertTriangle, MessageSquare, Check, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BacklogEditModal } from './BacklogEditModal';
import { ImagePreviewModal } from './ImagePreviewModal';
import type { BacklogItem, BacklogStatus, BacklogPriority } from '@/types';

interface Attachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
}

type ItemWithAssignee = BacklogItem & {
  assignee?: { full_name: string; avatar_url: string | null; dev_role: string | null } | null;
  backlog_attachments?: Attachment[];
  blocker?: { id: string; title: string; status: string } | null;
};

interface BacklogItemCardProps {
  item: ItemWithAssignee;
  sprints: { id: string; name: string }[];
  onUpdate: () => void;
  compact?: boolean;
  draggable?: boolean;
}

const BULLET_COLORS: Record<BacklogStatus, string> = {
  backlog: 'bg-muted-foreground/50',
  todo: 'bg-amber-500',
  in_progress: 'bg-blue-500',
  review: 'bg-purple-500',
  done: 'bg-green-500',
};

const PRIORITY_COLORS: Record<BacklogPriority, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-blue-500',
  low: 'border-l-muted-foreground/30',
};

const STATUS_OPTIONS: { value: BacklogStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
];

export function BacklogItemCard({ item, sprints, onUpdate, compact = false, draggable: isDraggable = false }: BacklogItemCardProps) {
  const [updating, setUpdating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewHasScreenshot, setReviewHasScreenshot] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewHistory, setReviewHistory] = useState<{ id: string; status: string; comment: string | null; has_screenshot: boolean; created_at: string; reviewer: { full_name: string } | null }[]>([]);
  const [blockerModal, setBlockerModal] = useState<{
    error: string;
    blocker?: { seq_id: number; title: string; status: string; priority: string; prd_id: string | null; assignee_name: string | null };
  } | null>(null);
  const [team, setTeam] = useState<{ id: string; full_name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const attachments = item.backlog_attachments ?? [];
  const blocker = item.blocker as { id: string; title: string; status: string; seq_id?: number } | null | undefined;
  const isBlocked = !!(blocker && blocker.status && blocker.status !== 'done');
  const hasReviewHistory = reviewHistory.length > 0;
  const hasDetail = !!item.description || attachments.length > 0 || isBlocked || item.reviewer_id;

  function handleStatusChange(newStatus: string) {
    // If item is in review and someone changes status, redirect to Review Modal
    if (item.status === 'review' && (newStatus === 'in_progress' || newStatus === 'done')) {
      setReviewOpen(true);
      fetchReviews();
      return;
    }
    updateItem('status', newStatus);
  }

  async function updateItem(field: string, value: unknown) {
    setUpdating(true);
    const res = await fetch(`/api/backlog/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    setUpdating(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setBlockerModal({ error: err.error ?? 'Blocked by dependency', blocker: err.blocker });
      } else if (res.status === 422) {
        toast.error(err.error ?? 'Review required before marking as done');
      } else {
        toast.error(err.error ?? 'Update failed');
      }
      return;
    }
    onUpdate();
  }

  async function handleDelete() {
    const res = await fetch(`/api/backlog/${item.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Delete failed'); return; }
    onUpdate();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/backlog/${item.id}/attachments`, { method: 'POST', body: fd });
    setUploading(false);
    e.target.value = '';
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? 'Upload failed');
      return;
    }
    toast.success('Attachment added');
    setExpanded(true);
    onUpdate();
  }

  async function openEdit() {
    // Lazy-fetch team members
    if (team.length === 0) {
      const res = await fetch('/api/settings/dev-roles');
      if (res.ok) {
        const data = await res.json();
        setTeam((data.members ?? []).map((m: { id: string; full_name: string }) => ({ id: m.id, full_name: m.full_name })));
      }
    }
    setEditOpen(true);
  }

  async function requestUnblock() {
    const res = await fetch(`/api/backlog/${item.id}/request-unblock`, { method: 'POST' });
    if (res.ok) {
      toast.success('Unblock request sent to the blocker\'s assignee');
    } else {
      toast.error('Failed to send request');
    }
  }

  async function fetchReviews() {
    const res = await fetch(`/api/backlog/${item.id}/reviews`);
    if (res.ok) {
      const data = await res.json();
      setReviewHistory(data.reviews ?? []);
    }
  }

  async function submitReview(status: 'approved' | 'changes_requested') {
    setSubmittingReview(true);
    const res = await fetch(`/api/backlog/${item.id}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        comment: reviewComment.trim() || null,
        has_screenshot: reviewHasScreenshot,
      }),
    });
    setSubmittingReview(false);
    if (!res.ok) { toast.error('Failed to submit review'); return; }
    toast.success(status === 'approved' ? 'Approved! Item moved to Done.' : 'Changes requested. Item moved back to In Progress.');
    setReviewOpen(false);
    setReviewComment('');
    setReviewHasScreenshot(false);
    onUpdate();
  }

  async function handleDeleteAttachment(attachmentId: string) {
    const res = await fetch(`/api/backlog/${item.id}/attachments?attachment_id=${attachmentId}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Delete failed'); return; }
    onUpdate();
  }

  return (
    <>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div
          className={cn(
            'border rounded-lg border-l-4 transition-colors hover:bg-muted/30 group cursor-pointer',
            compact ? 'p-2' : 'p-3',
            PRIORITY_COLORS[item.priority],
            updating && 'opacity-60',
          )}
          draggable={isDraggable}
          onDragStart={e => {
            e.dataTransfer.setData('text/plain', item.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onClick={e => {
            const target = e.target as HTMLElement;
            if (target.closest('button, select, input, [role="combobox"], [data-radix-collection-item], a')) return;
            setExpanded(prev => {
              if (!prev && item.reviewer_id) fetchReviews();
              return !prev;
            });
          }}
        >
          {/* Top row: title + badges */}
          <div className="flex items-start gap-1.5">
            <ChevronRight
              size={12}
              className={cn(
                'shrink-0 mt-0.5 text-muted-foreground transition-transform',
                expanded && 'rotate-90',
                !hasDetail && 'invisible',
              )}
            />
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-medium', compact && 'text-xs line-clamp-2')}>
                <span className="text-[9px] font-mono text-muted-foreground mr-1.5">BL-{item.seq_id}</span>
                {item.title}
              </p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {item.prd_id && (
                  <Badge variant="outline" className="text-[8px] px-1 py-0 gap-0.5 shrink-0">
                    <FileCode2 size={8} />
                    {item.prd_id}
                  </Badge>
                )}
                {isBlocked && (
                  <Badge variant="destructive" className="text-[8px] px-1 py-0 gap-0.5 shrink-0">
                    <Ban size={7} />
                    Blocked
                  </Badge>
                )}
                {attachments.length > 0 && (
                  <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                    <Paperclip size={9} />
                    {attachments.length}
                  </span>
                )}
                {item.estimated_hours && (
                  <span className="text-[9px] text-muted-foreground/60">{item.estimated_hours}h</span>
                )}
              </div>
            </div>
          </div>

          {/* Bottom row: assignee + actions (hover only) */}
          <div className="flex items-center justify-between mt-1.5 gap-1">
            <div className="flex items-center gap-1 min-w-0">
              {item.assignee ? (
                <>
                  {item.assignee.avatar_url ? (
                    <Image src={item.assignee.avatar_url} alt="" width={16} height={16} className="size-4 rounded-full object-cover shrink-0" />
                  ) : (
                    <User size={11} className="text-muted-foreground shrink-0" />
                  )}
                  <span className="text-[10px] text-muted-foreground truncate">{item.assignee.full_name?.split(' ')[0]}</span>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground/40">—</span>
              )}
            </div>

            {/* Actions — visible on hover */}
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Select value={item.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="h-6 text-[10px] px-1.5 w-auto min-w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="flex items-center gap-1.5">
                        <span className={cn('size-2 rounded-full', BULLET_COLORS[s.value])} />
                        {s.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={openEdit}
              >
                <Pencil size={11} />
              </Button>

              {(item.status === 'in_progress' || item.status === 'review' || item.status === 'done') && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-purple-500"
                  onClick={() => { setReviewOpen(true); fetchReviews(); }}
                >
                  <MessageSquare size={11} />
                </Button>
              )}

              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <ImagePlus size={11} />
              </Button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="image/*,video/mp4,video/webm,application/pdf"
                onChange={handleFileUpload}
              />

              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive"
                onClick={handleDelete}
              >
                <Trash2 size={11} />
              </Button>
            </div>
          </div>

          {/* Expanded: description + attachments */}
          <CollapsibleContent>
            <div className="mt-2 pt-2 border-t space-y-2">
              {isBlocked && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-destructive bg-destructive/5 rounded px-2 py-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Ban size={10} className="shrink-0" />
                    <span className="truncate">Blocked by <strong>BL-{blocker?.seq_id ?? '?'}: {blocker!.title}</strong> ({blocker!.status?.replace('_', ' ')})</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2 shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={requestUnblock}
                  >
                    <BellRing size={10} className="mr-1" />
                    Request
                  </Button>
                </div>
              )}
              {item.description && (
                <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{item.description}</p>
              )}
              {item.prd_section && (
                <p className="text-[10px] text-muted-foreground/60">Section: {item.prd_section}</p>
              )}

              {/* Inline review history */}
              {hasReviewHistory && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Reviews</p>
                  {reviewHistory.slice(0, 2).map(r => (
                    <div key={r.id} className={cn(
                      'rounded px-2 py-1 text-[10px] flex items-center justify-between gap-2',
                      r.status === 'approved' && 'bg-green-500/10 text-green-600',
                      r.status === 'changes_requested' && 'bg-amber-500/10 text-amber-600',
                      r.status === 'pending' && 'bg-muted text-muted-foreground',
                    )}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        {r.status === 'approved' ? <Check size={9} /> : <RotateCcw size={9} />}
                        <span className="font-medium">{(r.reviewer as { full_name: string } | null)?.full_name ?? 'Unknown'}</span>
                        {r.comment && <span className="truncate text-muted-foreground">— {r.comment}</span>}
                      </div>
                      <span className="text-[8px] text-muted-foreground/50 shrink-0">
                        {new Date(r.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  ))}
                  {reviewHistory.length > 2 && (
                    <button
                      type="button"
                      className="text-[9px] text-primary hover:underline"
                      onClick={() => { setReviewOpen(true); }}
                    >
                      +{reviewHistory.length - 2} more reviews
                    </button>
                  )}
                </div>
              )}

              {/* Approval badge for done items */}
              {item.status === 'done' && hasReviewHistory && reviewHistory[0]?.status === 'approved' && (
                <div className="flex items-center gap-1.5 text-[10px] text-green-600 bg-green-500/10 rounded px-2 py-1">
                  <Check size={10} />
                  <span>Approved by {(reviewHistory[0].reviewer as { full_name: string } | null)?.full_name ?? 'reviewer'} on {new Date(reviewHistory[0].created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                </div>
              )}

              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {attachments.map(a => (
                    <div key={a.id} className="relative group/att">
                      {a.file_type.startsWith('image/') ? (
                        <button type="button" onClick={() => setPreviewSrc(a.file_url)}>
                          <Image
                            src={a.file_url}
                            alt={a.file_name}
                            width={100}
                            height={68}
                            className="rounded border object-cover w-[100px] h-[68px] cursor-pointer hover:opacity-80 transition-opacity"
                          />
                        </button>
                      ) : (
                        <a
                          href={a.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2 py-1 rounded border text-[10px] text-muted-foreground hover:bg-muted"
                        >
                          <Paperclip size={10} />
                          <span className="truncate max-w-[80px]">{a.file_name}</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(a.id)}
                        className="absolute -top-1 -right-1 size-3.5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
                      >
                        <X size={8} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <ImagePreviewModal
        src={previewSrc}
        alt={item.title}
        onClose={() => setPreviewSrc(null)}
      />

      <BacklogEditModal
        item={editOpen ? item : null}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={onUpdate}
        team={team}
      />

      {/* Review modal */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare size={16} className="text-purple-500" />
              Review BL-{item.seq_id}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{item.title}</p>

            {/* Review history */}
            {reviewHistory.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Previous reviews</p>
                {reviewHistory.map(r => (
                  <div key={r.id} className={cn(
                    'border rounded p-2 text-xs space-y-1',
                    r.status === 'approved' && 'border-green-500/30 bg-green-500/5',
                    r.status === 'changes_requested' && 'border-amber-500/30 bg-amber-500/5',
                  )}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {(r.reviewer as { full_name: string } | null)?.full_name ?? 'Unknown'}
                      </span>
                      <Badge variant="secondary" className="text-[9px]">
                        {r.status === 'approved' ? 'Approved' : 'Changes requested'}
                      </Badge>
                    </div>
                    {r.comment && <p className="text-muted-foreground">{r.comment}</p>}
                    {r.has_screenshot && <span className="text-[9px] text-muted-foreground/60">📎 Has screenshot</span>}
                    <p className="text-[9px] text-muted-foreground/50">
                      {new Date(r.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* New review form — only when status is 'review' */}
            {item.status === 'review' ? (
              <div className="space-y-3 border-t pt-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Submit review</p>
                <Textarea
                  placeholder="Review comment — describe what you checked, issues found, or why you approve..."
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  className="min-h-[80px] resize-none text-sm"
                />
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={reviewHasScreenshot}
                    onCheckedChange={v => setReviewHasScreenshot(!!v)}
                  />
                  I attached screenshot(s) to this item
                </label>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground border-t pt-3">
                {reviewHistory.length === 0
                  ? 'No reviews yet. Move this item to "Review" status to enable review submissions.'
                  : 'Review form available when item is in "Review" status.'}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {item.status === 'review' ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => submitReview('changes_requested')}
                  disabled={submittingReview}
                  className="border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                >
                  <RotateCcw size={13} className="mr-1.5" />
                  Request Changes
                </Button>
                <Button
                  onClick={() => submitReview('approved')}
                  disabled={submittingReview}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Check size={13} className="mr-1.5" />
                  Approve
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setReviewOpen(false)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blocker modal */}
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
                  {blockerModal.blocker.prd_id && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">PRD</span>
                      <p className="font-medium text-foreground">{blockerModal.blocker.prd_id}</p>
                    </div>
                  )}
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
                await requestUnblock();
                setBlockerModal(null);
              }}
            >
              <BellRing size={14} className="mr-1.5" />
              Request Unblock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
