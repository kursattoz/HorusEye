// BL-271 — Structured audit trail for the dataset training pipeline.
// Used by /api/ai/datasets/* endpoints (BL-266) and the admin UI
// (BL-267). PRD-017 §15 — every state change should be reconstructable
// from audit_logs. Mirrors the shape of lib/audit/incident-decision.ts.

import { log } from '@/lib/logger';

export type DatasetAuditAction =
  | 'import'
  | 'validate'
  | 'merge'
  | 'deploy'
  | 'annotation_complete';

const ACTION_LABEL: Record<DatasetAuditAction, string> = {
  import:              'Dataset imported',
  validate:            'Quality report generated',
  merge:               'Datasets merged',
  deploy:              'Dataset deployed for training',
  annotation_complete: 'Annotation review completed',
};

const ACTION_EVENT: Record<DatasetAuditAction, `dataset.${DatasetAuditAction}`> = {
  import:              'dataset.import',
  validate:            'dataset.validate',
  merge:               'dataset.merge',
  deploy:              'dataset.deploy',
  annotation_complete: 'dataset.annotation_complete',
};

export interface DatasetAudit {
  action:    DatasetAuditAction;
  datasetId: string;
  actorId:   string;
  // Free-form context — counts, source list, quality_report excerpt, etc.
  // Persisted alongside the audit row so analysts can reconstruct the
  // operation without re-reading the corpus on disk.
  metadata?: Record<string, unknown>;
}

export async function logDatasetEvent(audit: DatasetAudit): Promise<void> {
  await log({
    event_type:    ACTION_EVENT[audit.action],
    severity:      audit.action === 'deploy' ? 'warn' : 'info',
    user_id:       audit.actorId,
    resource_type: 'dataset',
    resource_id:   audit.datasetId,
    action:        ACTION_LABEL[audit.action],
    metadata:      audit.metadata ?? {},
  });
}
