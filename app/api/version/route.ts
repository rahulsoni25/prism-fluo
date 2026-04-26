import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // never cache — always live

export function GET() {
  const sha    = process.env.RAILWAY_GIT_COMMIT_SHA ?? 'local';
  const branch = process.env.RAILWAY_GIT_BRANCH      ?? 'unknown';
  const author = process.env.RAILWAY_GIT_AUTHOR       ?? 'unknown';

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
  });
}
