const { createClient } = require('@supabase/supabase-js');

async function run() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log('URL?', !!url, 'KEY?', !!key);
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client
    .from('group_session_events')
    .insert({ session_code: 'TEST', event_type: 'debug', payload: { foo: 'bar' } })
    .select();
  if (error) {
    console.error('Insert error:', error);
  } else {
    console.log('Insert success:', data);
  }
}

run().catch((error) => {
  console.error('Fatal:', error);
});
