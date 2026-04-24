/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Allow large Excel uploads through the API body parser
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  // Increase the default API body size limit (used by route handlers)
  // This is separate from serverActions — both are needed
};

export default nextConfig;
