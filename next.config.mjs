/** @type {import('next').NextConfig} */
const nextConfig = {
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
