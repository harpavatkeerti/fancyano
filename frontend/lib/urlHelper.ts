/**
 * URL utilities for making server URLs accessible from external devices.
 *
 * NEXT_PUBLIC_SERVER_IP is optional — set it in .env.local when the server
 * is accessed from mobile devices or other hosts on the same network.
 */

/** Resolved once at module load (Next.js evaluates NEXT_PUBLIC_* at build time). */
const CONFIGURED_SERVER_IP = process.env.NEXT_PUBLIC_SERVER_IP ?? null;

const LOOPBACK_RE = /localhost|127\.0\.0\.1/;

/**
 * Replaces localhost / 127.0.0.1 in a URL with the real server IP so the
 * URL can be shared via WhatsApp, email, etc. and opened on other devices.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SERVER_IP env var (set at build time)
 *   2. window.location.hostname (runtime — only works when the browser is
 *      already on the same host as the server)
 *   3. Returns the original URL unchanged if no non-loopback IP is available.
 */
export function makeShareableUrl(url: string): string {
  if (!LOOPBACK_RE.test(url)) return url;

  const serverIP =
    CONFIGURED_SERVER_IP ??
    (typeof window !== 'undefined' ? window.location.hostname : null);

  if (!serverIP || LOOPBACK_RE.test(serverIP)) return url;

  return url.replace(LOOPBACK_RE, serverIP);
}
