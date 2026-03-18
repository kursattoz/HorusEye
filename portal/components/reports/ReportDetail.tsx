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
import { routes } from '@/constants/routes';
import { ChecklistSection } from './ChecklistSection';
import type { ReportDeliverable, ChecklistItem, DeliverableStatus } from '@/types';

interface TeamMember {
  id: string;
  full_name: string;
}

interface ReportDetailProps {
  deliverableId: string;
  userId: string;
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

export function ReportDetail({ deliverableId, userId }: ReportDetailProps) {
  const router = useRouter();
  const [deliverable, setDeliverable] = useState<ReportDeliverable | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [uploading, setUploading] = useState(false);

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

  useEffect(() => {
    fetchDeliverable();
    fetchChecklist();
    fetchTeam();
  }, [fetchDeliverable, fetchChecklist, fetchTeam]);

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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('display_name', file.name);
    fd.append('category', 'report');
    fd.append('is_public', 'false');

    const uploadRes = await fetch('/api/files/upload', { method: 'POST', body: fd });
    if (!uploadRes.ok) {
      toast.error('File upload failed');
      setUploading(false);
      return;
    }

    const { file: uploaded } = await uploadRes.json();
    await updateField('file_id', uploaded.id);
    setUploading(false);
    toast.success('File uploaded and linked');
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(routes.reports)}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{deliverable.deliverable_number}</span>
            <h1 className="text-xl font-semibold">{deliverable.title}</h1>
          </div>
          {deliverable.description && (
            <p className="text-sm text-muted-foreground mt-1">{deliverable.description}</p>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Deadline */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Deadline</label>
          <p className={`text-sm font-medium ${isPastDeadline ? 'text-destructive' : ''}`}>
            {new Date(deliverable.deadline).toLocaleDateString('tr-TR', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
            {isPastDeadline && <span className="ml-2 text-xs">(overdue)</span>}
          </p>
        </div>

        {/* Status */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select
            value={deliverable.status}
            onValueChange={v => updateField('status', v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Assigned to */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Assigned to</label>
          <Select
            value={deliverable.assigned_to ?? 'unassigned'}
            onValueChange={v => updateField('assigned_to', v === 'unassigned' ? null : v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {team.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Progress bar */}
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

      {/* Checklist */}
      <div className="border rounded-lg p-4">
        <ChecklistSection
          deliverableId={deliverableId}
          items={items}
          onUpdate={fetchChecklist}
        />
      </div>

      {/* File upload */}
      <div className="border rounded-lg p-4 space-y-3">
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
        <div>
          <input
            type="file"
            id="report-file-upload"
            className="hidden"
            onChange={handleFileUpload}
            accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('report-file-upload')?.click()}
            disabled={uploading}
          >
            <Upload size={14} className="mr-1.5" />
            {uploading ? 'Uploading...' : deliverable.file_id ? 'Replace file' : 'Upload file'}
          </Button>
        </div>
      </div>
    </div>
  );
}
