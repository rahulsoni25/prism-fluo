import { NextRequest, NextResponse } from 'next/server';
import { signSession, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth/session';
import { upsertUser } from '@/lib/auth/server';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  // Use the actual request origin — this is always accurate on Vercel
  const origin = req.nextUrl.origin;
  const fallbackRedirect = `${origin}/login`;

  if (error || !code) {
    return NextResponse.redirect(`${fallbackRedirect}?error=oauth_denied&detail=${encodeURIComponent(error || 'no_code')}`);
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  const redirectUri = `${origin}/api/auth/oauth/google/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${fallbackRedirect}?error=oauth_not_configured`);
  }

  try {
    // 1. Exchange auth code for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      const msg = tokenData.error_description || tokenData.error || 'token_exchange_failed';
      console.error('Google token error:', tokenData);
      return NextResponse.redirect(`${fallbackRedirect}?error=token_failed&detail=${encodeURIComponent(msg)}`);
    }

    // 2. Fetch user profile from Google
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    
    const profileData = await profileRes.json();
    if (!profileRes.ok) {
      return NextResponse.redirect(`${fallbackRedirect}?error=profile_failed`);
    }

    // 3. Upsert user in the database
    const user = await upsertUser({
      email: profileData.email,
      name: profileData.name || null,
      image: profileData.picture || null,
      provider: 'google',
      providerId: profileData.id,
    });

    // 4. Sign our custom lightweight session cookie
    const token = await signSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      provider: 'google',
    });

    // 5. Redirect back to the dashboard with the session cookie attached
    const res = NextResponse.redirect(`${origin}/dashboard`);
    res.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
    
    return res;

  } catch (err: any) {
    console.error('Google OAuth error:', err);
    return NextResponse.redirect(`${fallbackRedirect}?error=oauth_exception&detail=${encodeURIComponent(err?.message || 'unknown')}`);
  }
}
