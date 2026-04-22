import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('prism.db');

db.all('SELECT * FROM datasets', (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log('--- DATASETS ---');
    console.log(JSON.stringify(rows, null, 2));
  }
  db.close();
});
