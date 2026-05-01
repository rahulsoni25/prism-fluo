/**
 * TEMPORARY ENDPOINT FOR DATABASE INITIALIZATION
 * This endpoint initializes the database schema.
 * Remove after successful initialization.
 *
 * SECURITY: Requires INIT_DB_SECRET header to prevent accidental/malicious use
 * Usage: POST /api/init-db with header X-Init-Secret: <secret>
 * Response: { success: true, message: "..." }
 */

import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // Check for initialization secret (prevents accidental/malicious use)
    const initSecret = req.headers.get('X-Init-Secret');
    const expectedSecret = process.env.INIT_DB_SECRET || 'temporary-init-secret';

    if (initSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid or missing X-Init-Secret header' },
        { status: 403 }
      );
    }

    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      return NextResponse.json(
        { error: 'DATABASE_URL is not set' },
        { status: 400 }
      );
    }

    // Log the connection string for debugging (masked password)
    const maskedUrl = databaseUrl.replace(/:[^:@]+@/, ':***@');
    console.log('🔌 Database URL:', maskedUrl);

    const sslConfig = process.env.NODE_ENV === 'production'
      ? { ssl: { rejectUnauthorized: false } }
      : {};

    const client = new Client({ connectionString: databaseUrl, ...sslConfig });

    console.log('⏳ Connecting to database...');
    await client.connect();
    console.log('✅ Connected to Postgres');

    // Read schema.sql from the lib/db directory
    const schemaPath = join(process.cwd(), 'lib', 'db', 'schema.sql');
    const sql = readFileSync(schemaPath, 'utf8');

    console.log('⏳ Applying schema.sql…');
    await client.query(sql);
    console.log('✨ Database schema initialised successfully.');

    await client.end();

    return NextResponse.json(
      {
        success: true,
        message: 'Database schema initialized successfully. This endpoint can now be deleted.'
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('❌ Database initialisation failed:', err.message);
    return NextResponse.json(
      {
        error: 'Database initialization failed',
        details: err.message
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: 'This is the database initialization endpoint. Use POST to initialize.',
    usage: 'POST /api/init-db'
  });
}
