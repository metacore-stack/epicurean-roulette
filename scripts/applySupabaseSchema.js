const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

/**
 * Light-weight parser for .env style files. Ignores commented and blank lines,
 * preserves quoted values, and strips trailing comments where possible.
 */
function parseEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) {
    return env;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Drop inline comments that are not wrapped in quotes.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hashIndex = value.indexOf('#');
      if (hashIndex !== -1) {
        value = value.slice(0, hashIndex).trim();
      }
    }

    env[key] = value;
  });

  return env;
}

function buildDbConfig(env) {
  if (env.SUPABASE_DB_URL) {
    return { connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } };
  }

  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const password = env.SUPABASE_DB_PASSWORD || env.supabase_DB_password;

  if (!url || !password) {
    throw new Error('Missing SUPABASE_URL and/or SUPABASE_DB_PASSWORD values.');
  }

  let projectRef;
  try {
    const parsedUrl = new URL(url);
    const hostParts = parsedUrl.host.split('.');
    projectRef = hostParts[0];
  } catch (error) {
    throw new Error(`Unable to parse SUPABASE_URL (${url}): ${error.message}`);
  }

  return {
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password,
    ssl: { rejectUnauthorized: false },
  };
}

async function applySchema() {
  const projectRoot = path.resolve(__dirname, '..');
  const envPath = path.join(projectRoot, '.env.local');
  const schemaPath = path.join(projectRoot, 'supabase', 'phase9_schema.sql');

  const env = parseEnvFile(envPath);
  const dbConfig = buildDbConfig(env);
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = new Client(dbConfig);

  try {
    await client.connect();
    await client.query(sql);
    console.log('Supabase schema applied successfully.');
  } finally {
    await client.end();
  }
}

applySchema().catch((error) => {
  console.error('Failed to apply Supabase schema:', error.message);
  process.exitCode = 1;
});
