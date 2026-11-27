/**
 * Response headers for every page and route. Scripts and styles may be inline because Next writes inline scripts into
 * the page and nonces would mean rendering every page on each request; everything else is limited to this site and the
 * one database it signs in to.
 */
export function securityHeaders(development: boolean, supabaseUrl: string | undefined): { key: string; value: string }[] {
  let database = "";
  try {
    if (supabaseUrl) database = ` ${new URL(supabaseUrl).origin}`;
  } catch {
    /* an unreadable address is simply not allowed */
  }
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${database}${development ? " ws:" : ""}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // A private site has no reason to appear in a search engine.
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
  ];
}
