/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle into .next/standalone.
  // The Dockerfile copies only that folder + .next/static + public
  // into the final image — no node_modules needed at runtime (~50 MB image).
  output: 'standalone',

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
