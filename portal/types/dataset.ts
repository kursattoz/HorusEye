// PRD-017 §15 + PRD-021 BL-258/266 dataset domain types — single source
// of truth for the /admin/datasets UI and the /api/ai/datasets routes.

export type DatasetSourceType =
  | 'roboflow'
  | 'open_images'
  | 'kaggle'
  | 'coco'
  | 'internal'
  | 'merged'
  | 'custom';

export type DatasetStatus =
  | 'importing'
  | 'validating'
  | 'ready'
  | 'merged'
  | 'training'
  | 'archived';

export interface DatasetSummary {
  id:                string;
  name:              string;
  version:           string;
  source_type:       DatasetSourceType;
  source_url:        string | null;
  license:           string | null;
  target_classes:    string[];
  total_images:      number;
  total_annotations: number;
  split_counts:      Record<string, number>;
  class_counts:      Record<string, number>;
  storage_path:      string;
  status:            DatasetStatus;
  ai_model_id:       string | null;
  parent_id:         string | null;
  merged_from:       string[];
  created_by:        string | null;
  created_at:        string;
  updated_at:        string;
}

export interface DatasetDetail extends DatasetSummary {
  quality_report: Record<string, unknown> | null;
}

export interface DatasetQualityReport {
  passed?:           boolean;
  dataset_path?:     string;
  total_images?:     number;
  total_annotations?: number;
  issues?:           Record<string, number>;
  after_cleanup?: {
    total_images?:        number;
    total_annotations?:   number;
    class_distribution?:  Record<string, number>;
    brightness_range?:    [number | null, number | null];
    avg_laplacian_blur?:  number | null;
  };
  duplicate_groups?: Array<{ hash: string; files: string[] }>;
}
