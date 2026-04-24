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

  // Redirect the webpack/SWC build cache out of node_modules/.cache to avoid
  // EBUSY lock contention with the Docker build cache mount on Railway.
  webpack(config, { dev }) {
    if (!dev) {
      config.cache = {
        ...config.cache,
        cacheDirectory: '/tmp/next-webpack-cache',
      };
    }
    return config;
  },
};

export default nextConfig;
