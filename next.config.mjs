/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large Excel uploads (25 MB) through Server Actions and Route Handlers.
  // In Next.js 15+ this is a top-level key, not under experimental.
  serverExternalPackages: ['pg', 'exceljs'],
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
};

export default nextConfig;
