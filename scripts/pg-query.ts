/**
 * Quick PostgreSQL query tool for verification.
 * Usage: npx tsx scripts/pg-query.ts "SELECT count(*) FROM incidents"
 */

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const query = process.argv[2];
if (!query) {
  console.error("Usage: npx tsx scripts/pg-query.ts \"SELECT ...\"");
  process.exit(1);
}

async function main() {
  const result = await pool.query(query);
  
  if (result.rows.length === 0) {
    console.log("(no rows)");
  } else if (result.rows.length <= 50) {
    console.table(result.rows);
  } else {
    console.log(`${result.rows.length} rows returned. Showing first 50:`);
    console.table(result.rows.slice(0, 50));
  }
  
  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
