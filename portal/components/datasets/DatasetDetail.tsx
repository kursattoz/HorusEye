'use client';

// BL-267 — Dataset detail page. Renders the quality_report visualizer
// (PRD-017 §6.3 schema) and the action bar (export / archive).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Loader2, Archive, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { routes } from '@/constants/routes';
import type { DatasetDetail as DatasetDetailType, DatasetQualityReport } from '@/types/dataset';

interface Props {
  datasetId: string;
}

export function DatasetDetail({ datasetId }: Props) {
  const [dataset, setDataset]   = useState<DatasetDetailType | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);
  const [busy,    setBusy]      = useState<'export' | 'archive' | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/ai/datasets/${datasetId}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed to load dataset');
      setDataset(d.dataset as DatasetDetailType);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [datasetId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExport() {
    setBusy('export');
    try {
      const r = await fetch(`/api/ai/datasets/${datasetId}/export`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Export failed');
      window.open(d.url, '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(null);
    }
  }

  async function handleArchive() {
    if (!confirm('Archive this dataset? It will be hidden from active views but stays queryable.')) return;
    setBusy('archive');
    try {
      const r = await fetch(`/api/ai/datasets/${datasetId}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'Archive failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 size={16} className="animate-spin" /> Loading dataset&hellip;
    </div>
  );
  if (error)    return <p className="text-sm text-destructive">{error}</p>;
  if (!dataset) return <p className="text-sm text-muted-foreground">Dataset not found.</p>;

  const report = (dataset.quality_report ?? null) as DatasetQualityReport | null;
  const exportable = ['ready', 'merged', 'training'].includes(dataset.status);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link href={routes.datasets} className="text-xs text-muted-foreground hover:underline">
            <ArrowLeft size={12} className="inline" /> Back to datasets
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            {dataset.name} <span className="text-muted-foreground">v{dataset.version}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dataset.source_type} · <Badge variant="outline">{dataset.status}</Badge> · stored at
            <code className="ml-1 rounded bg-muted px-1 py-0.5 text-xs">{dataset.storage_path}</code>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null || !exportable}
            onClick={() => void handleExport()}
            title={exportable ? 'Open signed URL (5 min)' : `Status '${dataset.status}' is not exportable`}
          >
            {busy === 'export' ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Download size={14} className="mr-1" />}
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null || dataset.status === 'archived'}
            onClick={() => void handleArchive()}
          >
            {busy === 'archive' ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Archive size={14} className="mr-1" />}
            Archive
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Images"       value={dataset.total_images.toLocaleString()} />
        <Stat label="Annotations"  value={dataset.total_annotations.toLocaleString()} />
        <Stat label="Train"        value={(dataset.split_counts?.train ?? 0).toLocaleString()} />
        <Stat label="Val / Test"   value={`${(dataset.split_counts?.val ?? 0).toLocaleString()} / ${(dataset.split_counts?.test ?? 0).toLocaleString()}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {dataset.target_classes.map(c => (
              <Badge key={c} variant="outline" className="text-xs">
                {c}
                {dataset.class_counts?.[c] != null && (
                  <span className="ml-1 text-muted-foreground">· {dataset.class_counts[c].toLocaleString()}</span>
                )}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quality report</CardTitle>
        </CardHeader>
        <CardContent>
          {!report || Object.keys(report).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No quality report yet. Run
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">scripts/validate_dataset.py</code>
              and PUT the result onto the dataset record.
            </p>
          ) : (
            <QualityReportView report={report} />
          )}
        </CardContent>
      </Card>

      {dataset.merged_from?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Merged from</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {dataset.merged_from.map(id => (
              <Link key={id} href={routes.datasetDetail(id)} className="block font-mono text-xs hover:underline">
                {id}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function QualityReportView({ report }: { report: DatasetQualityReport }) {
  const issues = report.issues ?? {};
  const issueEntries = Object.entries(issues).filter(([, v]) => (v ?? 0) > 0);
  const passed = report.passed === true;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2">
        {passed
          ? <Badge className="bg-emerald-100 text-emerald-900"><CheckCircle2 size={12} className="mr-1" /> Passed</Badge>
          : <Badge className="bg-amber-100 text-amber-900"><AlertTriangle size={12} className="mr-1" /> Issues found</Badge>}
        <p className="text-muted-foreground">
          {report.total_images?.toLocaleString() ?? 0} images · {report.total_annotations?.toLocaleString() ?? 0} annotations scanned
        </p>
      </div>

      {issueEntries.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Issues</p>
          <ul className="space-y-1 text-xs">
            {issueEntries.map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                <span className="font-mono">{v.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.after_cleanup && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">After cleanup</p>
          <p className="text-xs text-muted-foreground">
            Images: {report.after_cleanup.total_images?.toLocaleString() ?? 0} · Annotations: {report.after_cleanup.total_annotations?.toLocaleString() ?? 0}
            {report.after_cleanup.avg_laplacian_blur != null && (
              <> · Avg Laplacian blur: {report.after_cleanup.avg_laplacian_blur}</>
            )}
          </p>
        </div>
      )}

      {report.duplicate_groups && report.duplicate_groups.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Duplicate groups ({report.duplicate_groups.length})
          </p>
          <ul className="space-y-1 text-xs">
            {report.duplicate_groups.slice(0, 10).map(g => (
              <li key={g.hash} className="font-mono text-muted-foreground">
                {g.hash}&hellip; · {g.files.length} files
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
