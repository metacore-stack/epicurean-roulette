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
  const envPath = path.join(__dirname, '..', '.env.local');
  const env = parseEnvFile(envPath);
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  const client = createClient(url, key, { auth: { persistSession: false } });
  const payload = { session_code: 'TEST', event_type: 'debug', payload: { inserted_at: new Date().toISOString() } };
  const { data, error } = await client.from('group_session_events').insert(payload).select();
  if (error) {
    console.error('Insert error:', error);
  } else {
    console.log('Insert success:', data);
  }
}

run().catch((error) => {
  console.error('Fatal:', error.message || error);
  process.exit(1);
});
