import { getEnv } from './env.js';

/**
 * Single origin-check shared by the Express CORS middleware and Socket.IO.
 * Allows: no-origin requests (curl, health checks), the configured CLIENT_URL,
 * localhost dev ports, and any port on the CLIENT_URL host (LAN testing).
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;

  const clientUrl = getEnv().CLIENT_URL;
  const allowed = new Set([
    'http://localhost:3000',
    'http://localhost:3002',
    'http://localhost:3003',
    clientUrl,
  ]);
  if (allowed.has(origin)) return true;

  try {
    const clientHost = new URL(clientUrl).hostname;
    const reqHost = new URL(origin).hostname;
    return reqHost === clientHost;
  } catch {
    return false;
  }
}

export function corsOriginHandler(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void {
  if (isOriginAllowed(origin)) {
    callback(null, true);
  } else {
    callback(new Error(`CORS origin not allowed: ${origin}`));
  }
}
