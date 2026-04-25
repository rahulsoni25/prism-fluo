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
  },
};

export default nextConfig;
