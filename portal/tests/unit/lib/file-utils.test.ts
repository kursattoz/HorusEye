import { describe, it, expect } from 'vitest';
import {
  getFileType,
  formatFileSize,
  isAllowedMimeType,
  isWithinSizeLimit,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/utils/file';

describe('getFileType', () => {
  it('identifies pdf', () => expect(getFileType('report.pdf')).toBe('pdf'));
  it('identifies pptx', () => expect(getFileType('slides.pptx')).toBe('pptx'));
  it('identifies docx', () => expect(getFileType('doc.docx')).toBe('docx'));
  it('identifies png as image', () => expect(getFileType('photo.png')).toBe('image'));
  it('identifies jpg as image', () => expect(getFileType('photo.jpg')).toBe('image'));
  it('identifies webp as image', () => expect(getFileType('photo.webp')).toBe('image'));
  it('identifies mp4 as video', () => expect(getFileType('video.mp4')).toBe('video'));
  it('identifies unknown extension as other', () => expect(getFileType('data.xyz')).toBe('other'));
  it('handles filename with no extension', () => expect(getFileType('README')).toBe('other'));
  it('is case-insensitive', () => expect(getFileType('REPORT.PDF')).toBe('pdf'));
});

describe('formatFileSize', () => {
  it('formats 0 bytes', () => expect(formatFileSize(0)).toBe('0 B'));
  it('formats bytes', () => expect(formatFileSize(500)).toBe('500 B'));
  it('formats kilobytes', () => expect(formatFileSize(1024)).toBe('1.0 KB'));
  it('formats megabytes', () => expect(formatFileSize(1024 * 1024)).toBe('1.0 MB'));
  it('formats gigabytes', () => expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB'));
});

describe('isAllowedMimeType', () => {
  it('allows pdf', () => expect(isAllowedMimeType('application/pdf')).toBe(true));
  it('allows pptx', () => expect(isAllowedMimeType('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe(true));
  it('allows jpeg', () => expect(isAllowedMimeType('image/jpeg')).toBe(true));
  it('rejects mp4', () => expect(isAllowedMimeType('video/mp4')).toBe(false));
  it('rejects unknown', () => expect(isAllowedMimeType('application/octet-stream')).toBe(false));
});

describe('isWithinSizeLimit', () => {
  it('accepts files under the limit', () => expect(isWithinSizeLimit(10 * 1024 * 1024)).toBe(true));
  it('accepts files at the exact limit', () => expect(isWithinSizeLimit(MAX_FILE_SIZE_BYTES)).toBe(true));
  it('rejects files over the limit', () => expect(isWithinSizeLimit(MAX_FILE_SIZE_BYTES + 1)).toBe(false));
});
