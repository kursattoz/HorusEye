// Plan §D — pre-exam attendance types.
// Mirrors the attendance_records table created in
// supabase/migrations/20260515090000_create_attendance_records.sql.

export type AttendanceStatus =
  | 'pending'
  | 'verified'
  | 'low_confidence'
  | 'failed'
  | 'manual_override';

// Threshold tuning from Plan §6.1 — slightly stricter than the runtime
// 0.65 so pre-exam verification has fewer false positives.
export const ATTENDANCE_VERIFY_THRESHOLD          = 0.75;
export const ATTENDANCE_LOW_CONFIDENCE_THRESHOLD  = 0.65;

export function classifyAttendanceSimilarity(similarity: number | null): AttendanceStatus {
  if (similarity == null)                                 return 'failed';
  if (similarity >= ATTENDANCE_VERIFY_THRESHOLD)          return 'verified';
  if (similarity >= ATTENDANCE_LOW_CONFIDENCE_THRESHOLD)  return 'low_confidence';
  return 'failed';
}

export interface AttendanceRecord {
  id:                      string;
  session_id:              string;
  student_id:              string;
  status:                  AttendanceStatus;
  similarity:              number | null;
  attempts:                number;
  first_check_at:          string | null;
  verified_at:             string | null;
  manual_override_by:      string | null;
  manual_override_reason:  string | null;
  evidence_path:           string | null;
  created_at:              string;
  updated_at:              string;
}

// Joined view for the proctor UI — each row carries student info so we
// don't need a separate fetch per row.
export interface AttendanceRow extends AttendanceRecord {
  students: {
    id:         string;
    student_id: string;
    full_name:  string;
  };
}
