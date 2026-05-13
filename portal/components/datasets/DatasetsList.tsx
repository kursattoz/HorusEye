'use client';

// BL-267 (Sprint 14) — /admin/datasets list view. Admin-only — RBAC is
// enforced by the proxy middleware (ADMIN_ONLY_ROUTES) + the API itself.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Database, Loader2, Plus, RefreshCw, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { routes } from '@/constants/routes';
import type { DatasetSummary, DatasetStatus } from '@/types/dataset';
import { DatasetCreateDialog } from './DatasetCreateDialog';
import { DatasetMergeWizard } from './DatasetMergeWizard';

const STATUS_TONE: Record<DatasetStatus, string> = {
  importing:  'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  validating: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  ready:      'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  merged:     'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200',
  training:   'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200',
  archived:   'bg-muted text-muted-foreground',
};

export function DatasetsList() {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [openNew,  setOpenNew]  = useState(false);
  const [openMerge, setOpenMerge] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/ai/datasets', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed to load datasets');
      setDatasets((d.datasets ?? []) as DatasetSummary[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  const totals = useMemo(() => ({
    count:       datasets.length,
    images:      datasets.reduce((s, d) => s + (d.total_images ?? 0), 0),
    annotations: datasets.reduce((s, d) => s + (d.total_annotations ?? 0), 0),
    ready:       datasets.filter(d => d.status === 'ready' || d.status === 'merged').length,
  }), [datasets]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryStat label="Datasets"        value={totals.count} />
        <SummaryStat label="Ready / merged"  value={totals.ready} />
        <SummaryStat label="Images"          value={totals.images.toLocaleString()} />
        <SummaryStat label="Annotations"     value={totals.annotations.toLocaleString()} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database size={16} /> Datasets
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={14} className="mr-1" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOpenMerge(true)}>
              <Wand2 size={14} className="mr-1" /> Merge
            </Button>
            <Button size="sm" onClick={() => setOpenNew(true)}>
              <Plus size={14} className="mr-1" /> New dataset
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> Loading datasets&hellip;
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : datasets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No datasets yet. Use <strong>New dataset</strong> after running
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">scripts/import_dataset.py</code>.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Images</TableHead>
                  <TableHead className="text-right">Annotations</TableHead>
                  <TableHead>Classes</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.map(d => (
                  <TableRow key={d.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        href={routes.datasetDetail(d.id)}
                        className="font-medium hover:underline"
                      >
                        {d.name} <span className="text-muted-foreground">v{d.version}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{d.source_type}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_TONE[d.status]}>{d.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(d.total_images ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(d.total_annotations ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {d.target_classes.join(', ')}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DatasetCreateDialog
        open={openNew}
        onOpenChange={setOpenNew}
        onCreated={() => { setOpenNew(false); void load(); }}
      />
      <DatasetMergeWizard
        open={openMerge}
        candidates={datasets.filter(d => d.status !== 'archived')}
        onOpenChange={setOpenMerge}
        onMerged={() => { setOpenMerge(false); void load(); }}
      />
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
