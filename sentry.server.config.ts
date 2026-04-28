/**
 * Sentry Server-side Configuration
 * Initialize Sentry for error tracking and performance monitoring
 * 
 * To enable: Set NEXT_PUBLIC_SENTRY_DSN in .env.local
 * Get DSN from: https://sentry.io (free tier available)
 */

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection(),
    ],
    // Capture 100% of transactions for performance monitoring in development
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Capture errors in development and production
    denyUrls: [
      // Browser extensions
      /extensions\//i,
      /^chrome:\/\//i,
      /^moz-extension:\/\//i,
    ],
  });
}

export default Sentry;
