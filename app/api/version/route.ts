import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // never cache — always live

export function GET() {
  // Support both Railway and Vercel deployment environments
  const sha    = process.env.VERCEL_GIT_COMMIT_SHA
              ?? process.env.RAILWAY_GIT_COMMIT_SHA
              ?? 'local';
  const branch = process.env.VERCEL_GIT_COMMIT_REF
              ?? process.env.RAILWAY_GIT_BRANCH
              ?? 'unknown';
  const author = process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME
              ?? process.env.RAILWAY_GIT_AUTHOR
              ?? 'unknown';

  return NextResponse.json({
    commit:     sha.slice(0, 7),          // short SHA  e.g. "3ac5b82"
    commitFull: sha,
    branch,
    author,
    deployedAt: new Date().toISOString(), // wall-clock time of this request
    nodeEnv:    process.env.NODE_ENV ?? 'development',
    geminiKey:  process.env.GEMINI_API_KEY ? '✅ set' : '❌ missing',
    ollamaKey:  process.env.OLLAMA_API_KEY ? '✅ set' : '❌ missing',
    dbUrl:      process.env.DATABASE_URL   ? '✅ set' : '❌ missing',
    authSecret: process.env.AUTH_SECRET    ? '✅ set' : '❌ missing — using insecure dev fallback',
    googleAuth: process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? '✅ set' : '❌ missing',
    linkedinAuth: process.env.AUTH_LINKEDIN_ID && process.env.AUTH_LINKEDIN_SECRET ? '✅ set' : '❌ missing',
  });
}
