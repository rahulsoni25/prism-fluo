/**
 * TEMPORARY ENDPOINT FOR DATABASE INITIALIZATION
 * This endpoint initializes the database schema.
 * Remove after successful initialization.
 *
 * Usage: POST /api/init-db
 * Response: { success: true, message: "..." }
 */

import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      return NextResponse.json(
        { error: 'DATABASE_URL is not set' },
        { status: 400 }
      );
    }

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
