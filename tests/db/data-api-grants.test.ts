/**
 * Guard for Supabase's 2026-10-30 Data API change: new `public` tables no
 * longer get PostgREST grants automatically. Every table the code reaches
 * via `/rest/v1/<table>` must be granted to service_role in both schema
 * paths, or a freshly built database answers "permission denied".
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SCHEMA_FILES = ['lib/db/schema.sql', 'app/api/migrate/route.ts'];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(e.name) ? [p] : [];
  });
}

const restTables = new Set(
  ['app', 'lib']
    .flatMap((d) => sourceFiles(path.join(ROOT, d)))
    .flatMap((f) =>
      Array.from(fs.readFileSync(f, 'utf8').matchAll(/\/rest\/v1\/([a-z_][a-z0-9_]*)/g), (m) => m[1]),
    ),
);

function serviceRoleGrants(file: string): Set<string> {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const re = /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.(\w+)\s+TO\s+service_role/gi;
  return new Set(Array.from(src.matchAll(re), (m) => m[1]));
}

describe('Supabase Data API grants', () => {
  it('finds the known PostgREST call sites (scan is not silently empty)', () => {
    expect([...restTables].sort()).toEqual(expect.arrayContaining(['briefs', 'users']));
  });

  it.each(SCHEMA_FILES)('%s grants service_role on every /rest/v1 table', (file) => {
    const granted = serviceRoleGrants(file);
    const missing = [...restTables].filter((t) => !granted.has(t));
    expect(missing).toEqual([]);
  });

  it.each(SCHEMA_FILES)('%s never grants anon or authenticated', (file) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(src).not.toMatch(/GRANT[^;]*\bTO\s+(anon|authenticated)\b/i);
  });

  it.each(SCHEMA_FILES)('%s guards the grant for plain Postgres without Supabase roles', (file) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(src).toMatch(/IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'service_role'\)/);
    expect(src).toMatch(/EXCEPTION WHEN OTHERS THEN/);
  });
});
