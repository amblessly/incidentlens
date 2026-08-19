const db = require('better-sqlite3')('./data/incidentlens.db');
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
tables.forEach(t => {
  console.log('-- Table: ' + t.name);
  console.log(t.sql + ';');
  console.log('');
});
