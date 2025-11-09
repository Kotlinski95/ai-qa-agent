/**
 * Utility functions for timing and delays
 */

/**
 * Creates a promise that resolves after a specified delay
 * @param ms - Number of milliseconds to delay
 * @returns Promise that resolves after the delay
 */
export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a random delay within a range
 * @param min - Minimum delay in milliseconds
 * @param max - Maximum delay in milliseconds
 * @returns Promise that resolves after a random delay
 */
export async function randomDelay(min: number, max: number): Promise<void> {
  const delayMs = min + Math.random() * (max - min);
  return delay(delayMs);
}

/**
 * Creates a jittered delay (base delay + random jitter)
 * Useful for avoiding thundering herd problems
 * @param baseMs - Base delay in milliseconds
 * @param jitterMs - Maximum jitter to add in milliseconds
 * @returns Promise that resolves after base + random jitter delay
 */
export async function jitteredDelay(
  baseMs: number,
  jitterMs: number = baseMs * 0.1
): Promise<void> {
  const delayMs = baseMs + Math.random() * jitterMs;
  return delay(delayMs);
}
