import sqlite3 from 'sqlite3';
import path from 'path';

// Local prism.db file
const DB_PATH = process.env.PRISM_DB_PATH || path.join(process.cwd(), 'prism.db');


const dbInstance = new sqlite3.Database(DB_PATH, async (err) => {
  if (err) {
    console.error('❌ Error opening SQLite database:', err.message);
  } else {
    console.log('✅ Connected to local SQLite database:', DB_PATH);
    // Enable WAL mode for much faster writes
    dbInstance.run('PRAGMA journal_mode=WAL');
    dbInstance.run('PRAGMA synchronous=NORMAL');

    // Auto-Initialize Schema if missing
    dbInstance.get("SELECT name FROM sqlite_master WHERE type='table' AND name='uploads'", (err, row) => {
      if (!row) {
        console.log('🚀 Initializing fresh database schema...');
        const fs = require('fs');
        const schema = fs.readFileSync(path.join(process.cwd(), 'lib/db/schema.sql'), 'utf8');
        dbInstance.exec(schema, (err) => {
          if (err) console.error('❌ Schema init failed:', err.message);
          else console.log('✅ Schema successfully initialized');
        });
      }
    });
  }
});


export const db = {
  // Simple wrapper to match the previous PG interface
  query: (sql: string, params: any[] = []): Promise<{ rows: any[] }> => {
    // Process params: Convert booleans to 0/1 for SQLite
    const processedParams = params.map(p => typeof p === 'boolean' ? (p ? 1 : 0) : p);

    // Convert Postgres $1, $2 syntax to SQLite ? syntax
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    
    return new Promise((resolve, reject) => {
      // Use .all for SELECT and .run for INSERT/UPDATE
      const trimmedSql = sqliteSql.trim().toUpperCase();
      const isSelect = trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('WITH');
      
      if (isSelect) {
        dbInstance.all(sqliteSql, processedParams, (err, rows) => {
          if (err) reject(err);
          else resolve({ rows: rows || [] });
        });
      } else {
        dbInstance.run(sqliteSql, processedParams, function(err) {
          if (err) reject(err);
          else resolve({ rows: [] }); // run doesn't return rows
        });
      }
    });
  },

  // Bulk insert: wraps all inserts in a single transaction (100x faster)
  bulkInsert: (sql: string, rowsParams: any[][]): Promise<void> => {
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    
    return new Promise((resolve, reject) => {
      dbInstance.serialize(() => {
        dbInstance.run('BEGIN TRANSACTION');
        
        const stmt = dbInstance.prepare(sqliteSql);
        for (const params of rowsParams) {
          const processed = params.map(p => typeof p === 'boolean' ? (p ? 1 : 0) : p);
          stmt.run(processed);
        }
        stmt.finalize();
        
        dbInstance.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  },
};
