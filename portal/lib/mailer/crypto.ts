import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

function getKey(): Buffer {
  const raw = process.env.SMTP_ENCRYPTION_KEY;
  if (!raw) throw new Error('SMTP_ENCRYPTION_KEY env var is not set');
  // Derive a fixed 32-byte key from the secret string
  return createHash('sha256').update(raw).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a colon-separated string: iv:authTag:ciphertext (all hex-encoded).
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const key = getKey();
  const iv  = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/**
 * Decrypts a string previously encrypted with `encrypt()`.
 * Returns empty string if input is empty.
 */
export function decrypt(encrypted: string): string {
  if (!encrypted) return '';
  const key = getKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  const [ivHex, tagHex, encHex] = parts as [string, string, string];
  const iv      = Buffer.from(ivHex,  'hex');
  const tag     = Buffer.from(tagHex, 'hex');
  const enc     = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc).toString('utf8') + decipher.final('utf8');
}
