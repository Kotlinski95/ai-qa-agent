/**
 * String sanitization utilities
 */

/**
 * Sanitize user input strings to prevent injection and ensure safety
 */
export function sanitizeString(input: any, maxLength: number = 1000): string {
  if (!input) return '';

  let str = String(input);

  // Trim whitespace
  str = str.trim();

  // Limit length
  if (str.length > maxLength) {
    str = str.substring(0, maxLength);
  }

  // Remove potentially dangerous characters
  str = str
    .replace(/[<>{}[\]]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');

  return str;
}

/**
 * Sanitize a URL
 */
export function sanitizeUrl(url: any): string {
  if (!url) return '';

  const str = String(url).trim();

  try {
    // Validate it's a valid URL
    const urlObj = new URL(str);
    // Only allow http and https
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return '';
    }
    return urlObj.href;
  } catch {
    return '';
  }
}

/**
 * Sanitize a JSON object
 */
export function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);

  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[sanitizeString(key)] = sanitizeObject(value);
  }
  return sanitized;
}
