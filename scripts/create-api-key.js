const db = require('better-sqlite3')('./data/incidentlens.db');
const crypto = require('crypto');

// Create an API key
const keyId = 'key-' + crypto.randomBytes(8).toString('hex');
const keyValue = 'il_' + crypto.randomBytes(24).toString('hex');
const keyHash = crypto.createHash('sha256').update(keyValue).digest('hex');
const keyPrefix = keyValue.slice(0, 8);

const workspace = db.prepare('SELECT * FROM workspaces LIMIT 1').get();
console.log('Workspace:', workspace.id);

db.prepare(
  'INSERT INTO api_keys (id, workspace_id, name, key_hash, key_prefix, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, NULL)'
).run(keyId, workspace.id, 'Demo API Key', keyHash, keyPrefix, new Date().toISOString());

console.log('API Key:', keyValue);
console.log('Key ID:', keyId);
