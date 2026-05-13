// PRD-000 Interface Contracts — single source of truth
// @interface AuthUser @version 1.1
export type UserRole = 'admin' | 'supervisor' | 'assistant' | 'guest';
export type DevRole = 'product_owner' | 'portal_frontend' | 'portal_backend' | 'ai_backend' | 'fullstack' | 'project_coordinator';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  dev_role: DevRole | null;
  team_id: string | null;
  full_name: string | null;   // user_profiles.full_name
  avatar_url: string | null;  // user_profiles.avatar_url (signed URL)
  created_at: string;
}

// @interface HorusFile @version 1.2
export type FileType = 'pdf' | 'pptx' | 'docx' | 'image' | 'video' | 'other';

export interface HorusFile {
  id: string;
  name: string;
  display_name: string;
  file_type: FileType;
  storage_path: string;
  public_url: string | null;    // null ise /d/[id] proxy üzerinden erişilir
  file_size_bytes: number;       // Bayt cinsinden dosya boyutu
  is_public: boolean;
  uploaded_by: string;
  team_id: string;
  blurred_pages: number[] | null;  // PDF'de bulanıklaştırılacak sayfa numaraları (admin ayarlar)
  sort_order: number | null;    // Admin manuel sıralama; null ise en sona
  document_date: string | null; // Kullanıcının belirlediği belge tarihi (upload tarihi değil)
  created_at: string;
  updated_at: string;
  deleted_at: string | null;    // Soft delete
  metadata: Record<string, unknown>;
}

// @interface LogEvent @version 1.1
export type LogEventType =
  | 'auth.login' | 'auth.logout' | 'auth.failed' | 'auth.password_reset'
  | 'file.upload' | 'file.download' | 'file.delete' | 'file.view' | 'file.update' | 'file.restore'
  | 'feedback.create' | 'feedback.update' | 'feedback.delete'
  | 'user.create' | 'user.update' | 'user.delete'
  | 'checklist.create' | 'checklist.update' | 'checklist.check' | 'checklist.uncheck' | 'checklist.delete'
  | 'system.error' | 'system.warning' | 'system.info' | 'page.visit';

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

// @interface Feedback @version 1.1
export type FeedbackType = 'general' | 'inline';

export interface Feedback {
  id: string;
  file_id: string;
  author_id: string;
  feedback_type: FeedbackType;
  content: string;
  line_ref: string | null;  // "sayfa:satır" formatı, örn: "2:15" — DB: VARCHAR(20)
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

// @interface ReportDeliverable @version 1.0
export type DeliverableStatus = 'pending' | 'in_progress' | 'completed';

export interface ReportDeliverable {
  id: string;
  title: string;
  description: string | null;
  deadline: string;
  deliverable_number: string;
  status: DeliverableStatus;
  assigned_to: string | null;
  file_id: string | null;
  created_at: string;
  updated_at: string;
}

// @interface ChecklistItem @version 1.0
export interface ChecklistItem {
  id: string;
  deliverable_id: string;
  label: string;
  description: string | null;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// @interface Notification @version 1.0
export type NotificationCategory = 'files' | 'feedback' | 'team' | 'system';

export interface Notification {
  id: string;
  user_id: string;
  category: NotificationCategory;
  title: string;
  description: string | null;
  is_read: boolean;
  link: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// @interface Sprint @version 1.0
export type SprintStatus = 'planning' | 'active' | 'completed';

export interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  status: SprintStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// @interface BacklogItem @version 2.0
export type BacklogStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type BacklogPriority = 'critical' | 'high' | 'medium' | 'low';

export interface BacklogItem {
  id: string;
  seq_id: number;
  sprint_id: string | null;
  title: string;
  description: string | null;
  prd_id: string | null;
  prd_section: string | null;
  epic: string | null;
  dev_role: DevRole | null;
  assigned_to: string | null;
  reviewer_id: string | null;
  deliverable_id: string | null;
  file_id: string | null;
  status: BacklogStatus;
  priority: BacklogPriority;
  estimated_hours: number | null;
  actual_hours: number | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  blocked_by: string | null;
}

// @interface BacklogActivity @version 1.0
export interface BacklogActivity {
  id: string;
  backlog_item_id: string;
  user_id: string;
  from_status: string | null;
  to_status: string | null;
  action: string;
  hours_logged: number | null;
  created_at: string;
}

// @interface BacklogReview @version 1.0
export interface BacklogReview {
  id: string;
  backlog_item_id: string;
  reviewer_id: string;
  status: 'pending' | 'approved' | 'changes_requested';
  comment: string | null;
  has_screenshot: boolean;
  created_at: string;
  updated_at: string;
}

// @interface Exam @version 1.0
export type ExamStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';

export interface Exam {
  id: string;
  name: string;
  course_code: string | null;
  description: string | null;
  scheduled_date: string;      // ISO DATE
  scheduled_start: string;     // HH:MM
  scheduled_end: string;       // HH:MM
  duration_minutes: number;
  status: ExamStatus;
  settings: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// @interface ExamRoom @version 1.0
export interface ExamRoom {
  id: string;
  name: string;
  capacity: number | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// @interface Camera @version 1.2 — adds is_fixed/owner_user_id/device_id/last_seen_at, room_id NULL (PRD-019)
export type CameraRole = 'front_wide' | 'front_close' | 'rear_wide' | 'side_left' | 'side_right';
export type CameraType = 'ip_camera' | 'phone' | 'usb_webcam';

export interface Camera {
  id: string;
  room_id: string | null;          // NULL for movable cams without home room
  label: string;
  stream_url: string;
  camera_type: CameraType;
  role: CameraRole;
  position_x: number | null;
  position_y: number | null;
  quality_score: number;
  is_active: boolean;
  is_fixed: boolean;
  owner_user_id: string | null;    // null = system-owned
  device_id: string | null;        // phone fingerprint for re-pair
  last_seen_at: string | null;
  created_at: string;
}

// @interface SessionCamera @version 1.0 — PRD-019
export interface SessionCamera {
  id: string;
  session_id: string;
  camera_id: string;
  added_at: string;
  added_by: string | null;
}

// @interface CameraHealthEvent @version 1.0 — PRD-019
export type CameraHealthEventType =
  | 'connected' | 'disconnected' | 'reconnected'
  | 'low_battery' | 'critical_battery' | 'charging'
  | 'app_backgrounded' | 'app_foregrounded'
  | 'overheat' | 'orientation_changed' | 'preview_offscreen'
  | 'permission_revoked';

export interface CameraHealthEvent {
  id: string;
  camera_id: string;
  session_id: string | null;
  event_type: CameraHealthEventType;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// @interface ExamSession @version 1.1
export type SessionStatus = 'scheduled' | 'active' | 'paused' | 'ended';

export interface ExamSession {
  id: string;
  exam_id: string;
  room_id: string;
  started_at: string | null;
  ended_at: string | null;
  status: SessionStatus;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type RiskTrend = 'rising' | 'stable' | 'falling';

// @interface Student @version 1.2
export interface Student {
  id: string;
  student_id: string;          // School ID (unique)
  full_name: string;
  email: string | null;
  department: string | null;
  is_active: boolean;
  // Risk cache (BL-225) — derived from incidents
  risk_score: number;
  risk_level: RiskLevel;
  risk_trend: RiskTrend;
  incident_count: number;
  risk_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

// @interface Incident @version 1.1
export type IncidentType =
  | 'phone_detected' | 'earbuds_detected' | 'paper_detected'
  | 'gaze_diversion' | 'head_turn' | 'empty_seat'
  | 'whispering' | 'unauthorized_communication' | 'position_uncertainty';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ProctorDecision = 'clean' | 'suspicious' | 'violation';

export interface Incident {
  id: string;
  session_id: string;
  student_id: string | null;
  track_id: number | null;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  confidence: number;
  risk_score: number | null;
  triggered_rules: string[];
  camera_ids: string[];
  evidence_paths: string[];
  raw_signals: Record<string, unknown> | null;
  is_reviewed: boolean;
  reviewed_by: string | null;
  review_note: string | null;
  proctor_decision: ProctorDecision | null;
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  occurred_at: string;
  created_at: string;
}
