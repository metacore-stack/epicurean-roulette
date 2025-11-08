import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env.local');
const env = parseEnvFile(envPath);
Object.assign(process.env, env);

const routeModule = await import('../src/app/api/group-session/state/route.js');

async function testPost() {
  const body = {
    code: 'SIMTEST',
    session: {
      groupCode: 'SIMTEST',
      votes: { Example: 1 },
      restaurants: [{ name: 'Example', rating: 4.2 }],
      version: 1,
      lastUpdatedAt: Date.now(),
    },
  };
  const request = new Request('http://localhost/api/group-session/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await routeModule.POST(request);
  console.log('POST status', response.status);
  console.log('POST body', await response.json());
}

async function testGet() {
  const request = new Request('http://localhost/api/group-session/state?code=SIMTEST');
  const response = await routeModule.GET(request);
  console.log('GET status', response.status);
  console.log('GET body', await response.json());
}

await testPost();
await testGet();
