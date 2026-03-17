// PRD-000 Interface Contracts — single source of truth
// @interface AuthUser @version 1.0
export type UserRole = 'admin' | 'supervisor' | 'assistant' | 'guest';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  team_id: string | null;
  created_at: string;
}

// @interface HorusFile @version 1.0
export type FileType = 'pdf' | 'pptx' | 'docx' | 'image' | 'video' | 'other';

export interface HorusFile {
  id: string;
  name: string;
  display_name: string;
  file_type: FileType;
  storage_path: string;
  public_url: string;
  is_public: boolean;
  uploaded_by: string;
  team_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  metadata: Record<string, unknown>;
}

// @interface LogEvent @version 1.0
export type LogEventType =
  | 'auth.login' | 'auth.logout' | 'auth.failed' | 'auth.password_reset'
  | 'file.upload' | 'file.download' | 'file.delete' | 'file.view' | 'file.update' | 'file.restore'
  | 'feedback.create' | 'feedback.update' | 'feedback.delete'
  | 'user.create' | 'user.update' | 'user.delete'
  | 'system.error' | 'system.warning' | 'page.visit';

export type LogSeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface LogEvent {
  id: string;
  event_type: LogEventType;
  severity: LogSeverity;
  user_id: string | null;
  session_id: string | null;
  resource_type: string;
  resource_id: string | null;
  action: string;
  metadata: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

// @interface Feedback @version 1.0
export type FeedbackType = 'general' | 'inline';

export interface Feedback {
  id: string;
  file_id: string;
  author_id: string;
  feedback_type: FeedbackType;
  content: string;
  line_ref: number | null;
  resolved: boolean;
  created_at: string;
  updated_at: string;
}

// @interface HealthStatus @version 1.0
export interface HealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latency_ms: number | null;
  last_checked: string;
  message: string | null;
}

export type Environment = 'local' | 'staging' | 'production';
