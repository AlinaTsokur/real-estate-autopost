import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CANVA_API = 'https://api.canva.com/rest/v1';
const TOKEN_FILE = join(process.env.HOME || '~', '.canva-refresh-token');

export const PRESENTATIONS = [
  { id: 'DAGivvue7IU', name: 'Availability Manarat Living' },
  { id: 'DAGiu7TJEvI', name: 'Availability Saadiyat Lagoons' },
  { id: 'DAGivrNLTNA', name: 'Availability Saadiyat Grove' },
  { id: 'DAGivi213Rc', name: 'Availability Saadiyat Marina District' },
  { id: 'DAGivi2jbfA', name: 'Availability Louvre Residences' },
  { id: 'DAGwOLPyOkw', name: 'Availability Mamsha District' },
  { id: 'DAGivgiDluc', name: 'Availability NOBU Residences' },
  { id: 'DAGlbrwqqS8', name: 'Availability The Arthouse' },
  { id: 'DAGivln7Q0A', name: 'Availability The Source' },
  { id: 'DAHHZpf7phg', name: 'Availability The Row & Mandarin Oriental' },
  { id: 'DAGivhZ7Ip8', name: 'Availability Yas Island' },
  { id: 'DAGw-xWxCEc', name: 'Availability Fahid Island' },
  { id: 'DAGr6-seFBk', name: 'Availability AlJurf Gardens' },
  { id: 'DAGivryBdPI', name: 'Availability Al Reem Island' },
  { id: 'DAG9z8eVLYk', name: 'Availability С3 Garden Residence' },
  { id: 'DAHLfmuWq58', name: 'Availability Hudayriyat Island' },
];

export function getTomorrowDateTag() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function readRefreshToken(): string {
  try {
    return readFileSync(TOKEN_FILE, 'utf-8').trim();
  } catch {
    return process.env.CANVA_REFRESH_TOKEN!;
  }
}

function saveRefreshToken(token: string) {
  try {
    writeFileSync(TOKEN_FILE, token, 'utf-8');
  } catch {}
}

export async function getCanvaAccessToken(): Promise<string> {
  const clientId = process.env.CANVA_CLIENT_ID!;
  const clientSecret = process.env.CANVA_CLIENT_SECRET!;
  const refreshToken = readRefreshToken();

  const res = await fetch(`${CANVA_API}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Canva token refresh failed: ${JSON.stringify(data)}`);
  }

  if (data.refresh_token) {
    saveRefreshToken(data.refresh_token);
  }

  return data.access_token;
}

export async function exportDesignAsPptx(designId: string, accessToken: string): Promise<string> {
  const res = await fetch(`${CANVA_API}/exports`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      design_id: designId,
      format: { type: 'pptx' },
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`PPTX export start failed for ${designId}: ${JSON.stringify(data)}`);

  const exportId: string = data.job?.id;
  if (!exportId) throw new Error(`No export job id for ${designId}`);

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const pollRes = await fetch(`${CANVA_API}/exports/${exportId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const pollData = await pollRes.json();
    const status = pollData.job?.status;
    if (status === 'success') {
      const url = pollData.job?.urls?.[0];
      if (!url) throw new Error(`No download URL for PPTX ${designId}`);
      return url;
    }
    if (status === 'failed') throw new Error(`PPTX export failed for ${designId}: ${JSON.stringify(pollData)}`);
  }

  throw new Error(`PPTX export timeout for ${designId}`);
}

export async function exportDesignAsPdf(designId: string, accessToken: string, pages?: number[]): Promise<string> {
  const res = await fetch(`${CANVA_API}/exports`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      design_id: designId,
      format: { type: 'pdf', export_quality: 'regular', ...(pages ? { pages } : {}) },
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Export start failed for ${designId}: ${JSON.stringify(data)}`);

  const exportId: string = data.job?.id;
  if (!exportId) throw new Error(`No export job id for ${designId}`);

  // Poll until done
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));

    const pollRes = await fetch(`${CANVA_API}/exports/${exportId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const pollData = await pollRes.json();
    const status = pollData.job?.status;

    if (status === 'success') {
      const url = pollData.job?.urls?.[0];
      if (!url) throw new Error(`No download URL for ${designId}`);
      return url;
    }
    if (status === 'failed') {
      throw new Error(`Export failed for ${designId}: ${JSON.stringify(pollData)}`);
    }
  }

  throw new Error(`Export timeout for ${designId}`);
}

export async function downloadFile(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

