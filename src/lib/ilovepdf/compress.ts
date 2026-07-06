export async function compressPdf(pdfBuffer: Buffer, filename: string): Promise<Buffer> {
  const publicKey = process.env.ILOVEPDF_PUBLIC_KEY;
  if (!publicKey) throw new Error('ILOVEPDF_PUBLIC_KEY not configured');

  // 1. Auth
  const authRes = await fetch('https://api.ilovepdf.com/v1/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: publicKey }),
  });
  const authData = await authRes.json();
  if (!authData.token) throw new Error(`ilovepdf auth failed: ${JSON.stringify(authData)}`);
  const token: string = authData.token;

  // 2. Start task
  const startRes = await fetch('https://api.ilovepdf.com/v1/start/compress', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const startData = await startRes.json();
  const { server, task } = startData;
  if (!server || !task) throw new Error(`ilovepdf start failed: ${JSON.stringify(startData)}`);

  // 3. Upload
  const form = new FormData();
  form.append('task', task);
  form.append('file', new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' }), filename);

  const uploadRes = await fetch(`https://${server}/v1/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const uploadData = await uploadRes.json();
  if (!uploadData.server_filename) throw new Error(`ilovepdf upload failed: ${JSON.stringify(uploadData)}`);

  // 4. Process
  const processRes = await fetch(`https://${server}/v1/process`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      task,
      tool: 'compress',
      files: [{ server_filename: uploadData.server_filename, filename }],
      compression_level: 'recommended',
    }),
  });
  if (!processRes.ok) {
    const err = await processRes.json();
    throw new Error(`ilovepdf process failed: ${JSON.stringify(err)}`);
  }

  // 5. Download
  const downloadRes = await fetch(`https://${server}/v1/download/${task}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!downloadRes.ok) throw new Error(`ilovepdf download failed: ${downloadRes.status}`);

  return Buffer.from(await downloadRes.arrayBuffer());
}
