import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import AdmZip from 'adm-zip';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const CANVA_API = 'https://api.canva.com/rest/v1';
const TOKEN_FILE = join(homedir(), '.canva-refresh-token');

function readRefreshToken() {
  try { return readFileSync(TOKEN_FILE, 'utf-8').trim(); } catch { return process.env.CANVA_REFRESH_TOKEN; }
}

async function getToken() {
  const refreshToken = readRefreshToken();
  const res = await fetch(`${CANVA_API}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error('Token failed: ' + JSON.stringify(d));
  if (d.refresh_token) writeFileSync(TOKEN_FILE, d.refresh_token, 'utf-8');
  return d.access_token;
}

async function exportPptx(designId, token) {
  const res = await fetch(`${CANVA_API}/exports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ design_id: designId, format: { type: 'pptx' } }),
  });
  const data = await res.json();
  console.log('Export response:', JSON.stringify(data).slice(0, 300));
  const exportId = data.job?.id;
  if (!exportId) throw new Error('No export ID');

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const poll = await fetch(`${CANVA_API}/exports/${exportId}`, { headers: { Authorization: `Bearer ${token}` } });
    const p = await poll.json();
    console.log(`Poll ${i+1}: ${p.job?.status}`);
    if (p.job?.status === 'success') return p.job.urls[0];
    if (p.job?.status === 'failed') throw new Error('Export failed: ' + JSON.stringify(p));
  }
  throw new Error('Timeout');
}

const DESIGN_ID = 'DAGivvue7IU';

console.log('Getting token...');
const token = await getToken();
console.log('Token OK');

console.log('Exporting PPTX...');
const url = await exportPptx(DESIGN_ID, token);

console.log('Downloading...');
const res = await fetch(url);
const buf = Buffer.from(await res.arrayBuffer());
writeFileSync('/tmp/test-canva.pptx', buf);
console.log(`Downloaded ${buf.length} bytes`);

console.log('\n=== Inspecting PPTX ===');
const zip = new AdmZip(buf);
const entries = zip.getEntries().map(e => e.entryName);
const slideFiles = entries.filter(n => n.match(/^ppt\/slides\/slide\d+\.xml$/));
console.log('Slide files:', slideFiles);

// Check each slide for show attribute
console.log('\n=== Per-slide hidden check ===');
for (const entry of slideFiles) {
  const xml = zip.readAsText(entry);
  const hasShow0 = /<p:sld[^>]*show="0"/.test(xml);
  const showMatch = xml.match(/<p:sld[^>]*/);
  console.log(`${entry}: show="0"=${hasShow0} | opening tag: ${showMatch?.[0]?.slice(0,100)}`);
}
