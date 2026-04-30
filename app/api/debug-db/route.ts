import { NextResponse } from 'next/server';

export async function GET() {
  const raw = process.env.DATABASE_URL || 'NOT SET';
  
  // Mask the password but show everything else
  let masked = raw;
  try {
    const url = new URL(raw);
    url.password = '***MASKED***';
    masked = url.toString();
  } catch {
    masked = raw.substring(0, 30) + '...(parse error)';
  }

  return NextResponse.json({
    masked_url: masked,
    has_value: !!process.env.DATABASE_URL,
    length: raw.length,
  });
}
