import type { JsonValue } from '@/types/common';

export function sanitizeString(input: unknown, maxLength: number = 1000): string {
  if (!input) return '';
  let str = String(input);
  str = str.trim();
  if (str.length > maxLength) {
    str = str.substring(0, maxLength);
  }
  str = str
    .replace(/[<>{}[\]]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
  return str;
}

export function sanitizeUrl(url: unknown): string {
  if (!url) return '';
  const str = String(url).trim();
  try {
    const urlObj = new URL(str);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return '';
    }
    return urlObj.href;
  } catch {
    return '';
  }
}

export function sanitizeObject(obj: JsonValue): JsonValue {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  const sanitized: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[sanitizeString(key)] = sanitizeObject(value);
  }
  return sanitized;
}
