// AI service WebSocket protocol — mirrors ai-service/src/api/protocol.py
// PRD-013 §3.2. Update both files together when changing the wire format.

import type { IncidentSeverity, IncidentType } from '@/types';

export const AI_PROTOCOL_VERSION = '1.1';

// ───────── client → server ─────────

export interface ClientSubscribe {
  type: 'subscribe';
  protocol_version: string;
  api_key: string;
  session_id: string;
  severity_min?: IncidentSeverity | null;
  incident_types?: IncidentType[] | null;
}

export interface ClientAck {
  type: 'ack';
  message_id: string;
}

export interface ClientUnsubscribe {
  type: 'unsubscribe';
  session_id: string;
}

export interface ClientPing {
  type: 'ping';
  timestamp: string;  // ISO 8601
}

export type ClientMessage = ClientSubscribe | ClientAck | ClientUnsubscribe | ClientPing;

// ───────── server → client ─────────

export type ServerStatusKind =
  | 'connected'
  | 'stream_started'
  | 'stream_paused'
  | 'stream_ended'
  | 'auth_failed'
  | 'session_unknown';

export interface ServerStatus {
  type: 'status';
  protocol_version: string;
  session_id: string;
  kind: ServerStatusKind;
  message: string;
  timestamp: string;
}

export interface ServerIncident {
  type: 'incident';
  protocol_version: string;
  message_id: string;
  session_id: string;
  incident_id: string;
  student_id: string | null;
  track_id: number | null;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  confidence: number;
  risk_score: number | null;
  triggered_rules: string[];
  camera_ids: string[];
  evidence_paths: string[];
  occurred_at: string;
}

export interface ServerDetection {
  type: 'detection';
  protocol_version: string;
  session_id: string;
  track_id: number | null;
  detection_class: string;
  confidence: number;
  bbox: [number, number, number, number];
  camera_id: string;
  timestamp: string;
}

export interface ServerFrame {
  type: 'frame';
  protocol_version: string;
  session_id: string;
  camera_id: string;
  width: number;
  height: number;
  jpeg_base64: string;
  timestamp: string;
  detections: ServerDetection[];
}

export interface ServerError {
  type: 'error';
  protocol_version: string;
  code: string;
  message: string;
  session_id: string | null;
}

export interface ServerPong {
  type: 'pong';
  timestamp: string;
}

export type ServerMessage =
  | ServerStatus
  | ServerIncident
  | ServerDetection
  | ServerFrame
  | ServerError
  | ServerPong;

export function isServerIncident(m: ServerMessage): m is ServerIncident {
  return m.type === 'incident';
}

export function isServerStatus(m: ServerMessage): m is ServerStatus {
  return m.type === 'status';
}
