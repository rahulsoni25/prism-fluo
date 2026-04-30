import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET(req: NextRequest) {
  const clientId = process.env.AUTH_GOOGLE_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 });
  }

  // Construct callback URL using the app origin (works across local and Vercel)
  const baseUrl = config.API_BASE_URL.replace(/\/$/, '');
  const redirectUri = `${baseUrl}/api/auth/oauth/google/callback`;

  const searchParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'consent',
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${searchParams.toString()}`);
}
