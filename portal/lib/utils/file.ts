import type { FileType } from '@/types';

export function getFileType(filename: string): FileType {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return 'other';
  if (ext === 'pdf')  return 'pdf';
  if (ext === 'pptx') return 'pptx';
  if (ext === 'docx') return 'docx';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  return 'other';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const unit = units[i] ?? 'B';
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${unit}`;
}

// Maps FileType to the Lucide icon name to use (import from lucide-react by name)
export const FILE_TYPE_ICON: Record<FileType, string> = {
  pdf:   'FileText',
  pptx:  'PresentationIcon',
  docx:  'FileText',
  image: 'Image',
  video: 'Video',
  other: 'File',
};

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export const MAX_FILE_SIZE_MB    = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function isAllowedMimeType(mimeType: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isWithinSizeLimit(bytes: number): boolean {
  return bytes <= MAX_FILE_SIZE_BYTES;
}
