'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Upload, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { routes } from '@/constants/routes';
import { ChecklistSection } from './ChecklistSection';
import { FileUploadDialog } from '@/components/dashboard/files/FileUploadDialog';
import type { ReportDeliverable, ChecklistItem, DeliverableStatus } from '@/types';

interface TeamMember {
  id: string;
  full_name: string;
}

interface ReportDetailProps {
  deliverableId: string;
}

const STATUS_OPTIONS: { value: DeliverableStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

const STATUS_VARIANT: Record<DeliverableStatus, 'secondary' | 'default' | 'outline'> = {
  pending: 'secondary',
  in_progress: 'default',
  completed: 'outline',
};

export function ReportDetail({ deliverableId }: ReportDetailProps) {
  const router = useRouter();
  const [deliverable, setDeliverable] = useState<ReportDeliverable | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const fetchDeliverable = useCallback(async () => {
    const res = await fetch(`/api/reports/${deliverableId}`);
    if (!res.ok) return;
    const { deliverable: d } = await res.json();
    setDeliverable(d);
  }, [deliverableId]);

  const fetchChecklist = useCallback(async () => {
    const res = await fetch(`/api/reports/${deliverableId}/checklist`);
    if (!res.ok) return;
    const { items: i } = await res.json();
    setItems(i);
  }, [deliverableId]);

  const fetchTeam = useCallback(async () => {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return;
    // Fetch all team members for assignment dropdown
    const teamRes = await fetch('/api/users');
    if (teamRes.ok) {
      const { users } = await teamRes.json();
      setTeam(users?.map((u: { id: string; full_name: string }) => ({ id: u.id, full_name: u.full_name })) ?? []);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- data fetching on mount */
  useEffect(() => {
    fetchDeliverable();
    fetchChecklist();
    fetchTeam();
  }, [fetchDeliverable, fetchChecklist, fetchTeam]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function updateField(field: string, value: unknown) {
    const res = await fetch(`/api/reports/${deliverableId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) {
      toast.error('Failed to update');
      return;
    }
    const { deliverable: d } = await res.json();
    setDeliverable(d);
    toast.success('Updated');
  }

  async function handleFileUploaded(file: Record<string, unknown>) {
    await updateField('file_id', file.id);
    setUploadDialogOpen(false);
    toast.success('File uploaded and linked');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    // Open the dialog — user dropped files on the zone
    setUploadDialogOpen(true);
  }

  if (!deliverable) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>;
  }

  const isPastDeadline = new Date(deliverable.deadline) < new Date() && deliverable.status !== 'completed';
  const checkedCount = items.filter(i => i.is_checked).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header + Meta — stacked on mobile, row on large screens */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:gap-8">
        {/* Left: title */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => router.push(routes.reports)}>
            <ArrowLeft size={18} />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">{deliverable.deliverable_number}</span>
              <h1 className="text-lg sm:text-xl font-semibold">{deliverable.title}</h1>
            </div>
            {deliverable.description && (
              <p className="text-sm text-muted-foreground mt-1">{deliverable.description}</p>
            )}
          </div>
        </div>

        {/* Right: meta fields inline on lg+ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex lg:items-end gap-4 mt-4 lg:mt-0 shrink-0">
          <div className="space-y-1 lg:w-40">
            <label className="text-xs font-medium text-muted-foreground">Deadline</label>
            <p className={`text-sm font-medium ${isPastDeadline ? 'text-destructive' : ''}`}>
              {new Date(deliverable.deadline).toLocaleDateString('tr-TR', {
                year: 'numeric', month: 'long', day: 'numeric',
              })}
              {isPastDeadline && <span className="ml-2 text-xs">(overdue)</span>}
            </p>
          </div>
          <div className="space-y-1 lg:w-36">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={deliverable.status} onValueChange={v => updateField('status', v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 lg:w-44">
            <label className="text-xs font-medium text-muted-foreground">Assigned to</label>
            <Select
              value={deliverable.assigned_to ?? 'unassigned'}
              onValueChange={v => updateField('assigned_to', v === 'unassigned' ? null : v)}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {team.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Progress bar — full width */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span>{checkedCount}/{totalCount} ({progress}%)</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Main content: Checklist + File upload — stacked on mobile, side by side on lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,340px] gap-6">
        {/* Checklist — takes all available width */}
        <div className="border rounded-lg p-4">
          <ChecklistSection
            deliverableId={deliverableId}
            items={items}
            onUpdate={fetchChecklist}
          />
        </div>

        {/* File upload sidebar — sticky on large screens */}
        <div className="border rounded-lg p-4 space-y-3 lg:sticky lg:top-4 self-start">
          <h3 className="text-sm font-semibold">Attached File</h3>

          {deliverable.file_id ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText size={16} />
              <span>File attached</span>
              <Badge variant={STATUS_VARIANT[deliverable.status]}>{deliverable.status.replace('_', ' ')}</Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No file uploaded yet.</p>
          )}

          {/* Drop zone */}
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
            )}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => setUploadDialogOpen(true)}
          >
            <div className="space-y-1">
              <Upload size={24} className="mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag and drop or <span className="text-primary underline">choose file</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {deliverable.file_id ? 'Replace current file' : 'PDF, PPTX, DOCX, PNG, JPG'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <FileUploadDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onUploaded={handleFileUploaded}
      />
    </div>
  );
}
