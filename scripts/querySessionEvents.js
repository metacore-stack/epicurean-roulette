const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function parseEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const raw = fs.readFileSync(filePath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf('#');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    env[key] = value;
  });
  return env;
}

async function run() {
  const code = process.argv[2];
  if (!code) {
    console.error('Usage: node scripts/querySessionEvents.js <GROUP_CODE>');
    process.exit(1);
  }
  const envPath = path.join(__dirname, '..', '.env.local');
  const env = parseEnvFile(envPath);
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await client
    .from('group_session_events')
    .select('*')
    .eq('session_code', code)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) {
    console.error('Query failed:', error.message);
  } else {
    console.log(`Found ${data.length} rows for ${code}`);
    data.forEach((row) => {
      console.log(row.created_at, row.event_type, JSON.stringify(row.payload));
    });
  }
}

run().catch((error) => {
  console.error('Fatal:', error.message || error);
  process.exit(1);
});
