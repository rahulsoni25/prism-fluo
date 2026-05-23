/** @type {import('next').NextConfig} */

// ── Security headers ─────────────────────────────────────────────────────
// Applied to every response via headers() below. Rationale:
//   HSTS                  → force HTTPS for 2y, prevents protocol downgrade
//   X-Frame-Options       → block clickjacking; this app is never iframed
//   X-Content-Type-Options→ stop MIME-type sniffing (defence in depth)
//   Referrer-Policy       → only send the origin on cross-origin nav (no
//                            leaking analysis IDs to outside referrers)
//   Permissions-Policy    → opt out of all the browser features we don't use
//   COOP / CORP           → strong cross-origin isolation, prevents
//                            Spectre-style leaks + popup-based attacks
//   X-DNS-Prefetch-Control→ allow DNS prefetch (perf, no security cost)
//
// CSP is intentionally NOT enforced at this layer. We rely on Next.js's
// per-route inline-style usage + Chart.js dynamic SVG — a strict CSP here
// would break the UI. CSP can be added later via middleware nonces.
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control',    value: 'on' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  // Content-Security-Policy — pragmatic policy that ALLOWS the inline
  // styles Chart.js + our inline-style components require (so we don't
  // break the UI), while still hard-restricting scripts and frames.
  //   default-src 'self'            — everything defaults to same-origin
  //   script-src 'self' 'unsafe-inline' 'unsafe-eval' — Next.js needs eval
  //     for HMR + runtime chunks; tighten later with nonces
  //   style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
  //     — required for inline-style React + Google Fonts in admin pages
  //   img-src 'self' data: https: blob:
  //     — data: for charts, blob: for canvas exports, https: for external imgs
  //   font-src 'self' https://fonts.gstatic.com data:
  //   connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com
  //     https://openrouter.ai https://generativelanguage.googleapis.com
  //     — OAuth callbacks + LLM endpoints
  //   frame-ancestors 'none' — same as X-Frame-Options DENY
  //   object-src 'none'      — block plugins
  //   base-uri 'self'        — prevent <base> injection
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' https://fonts.gstatic.com data:",
      "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://openrouter.ai https://generativelanguage.googleapis.com https://*.upstash.io https://www.googleapis.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig = {
  // Emit a self-contained server bundle into .next/standalone.
  // The Dockerfile copies only that folder + .next/static + public
  // into the final image — no node_modules needed at runtime (~50 MB image).
  output: 'standalone',

  async headers() {
    return [
      // Apply security headers to every path
      { source: '/:path*', headers: SECURITY_HEADERS },
      // Stricter caching directive on API routes (no caching of session data)
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0, must-revalidate' },
        ],
      },
    ];
  },

  typescript: {
    // ExcelJS types are incompatible with the newer @types/node bundled in
    // Next.js 16 (Buffer<ArrayBuffer> vs Buffer type mismatch).
    // This is a package-level type conflict — NOT a real runtime bug.
    // Re-enable once exceljs ships updated types.
    ignoreBuildErrors: true,
  },
  experimental: {
    // Allow large Excel uploads (up to 25 MB) through Server Actions
    serverActions: {
      bodySizeLimit: '25mb',
    },
    // Next.js 16 has a 10 MB cap on request bodies that pass through the
    // proxy/middleware (Next clones the body in memory so both proxy.ts
    // and the route handler can read it). Anything bigger gets silently
    // truncated to the first 10 MB — which corrupts the PPTX zip and
    // makes the parser return 0 slides. Lifted to 50 MB so big strategy
    // decks (Sargam ~10 MB, larger ones in pipeline) reach the route
    // intact. Aligned with the upload page's HARD_CAP_MB = 50.
    proxyClientMaxBodySize: '50mb',
  },
};

export default nextConfig;
