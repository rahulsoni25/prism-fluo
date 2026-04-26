/**
 * GET /api/auth/providers
 * Reports which OAuth providers are configured (have env vars set).
 * Used by the login page to enable/disable the social buttons.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    google:   Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    linkedin: Boolean(process.env.AUTH_LINKEDIN_ID && process.env.AUTH_LINKEDIN_SECRET),
    demo:     process.env.AUTH_DEMO_OPEN !== 'false',
  });
}
