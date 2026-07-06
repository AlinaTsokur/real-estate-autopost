import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) return new Response('No code in callback', { status: 400 });

  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get('canva_code_verifier')?.value;
  if (!codeVerifier) return new Response('Missing code_verifier cookie — попробуй начать авторизацию заново', { status: 400 });

  const clientId = process.env.CANVA_CLIENT_ID!;
  const clientSecret = process.env.CANVA_CLIENT_SECRET!;

  const res = await fetch('https://api.canva.com/rest/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'http://127.0.0.1:3000/api/canva-oauth/callback',
      code_verifier: codeVerifier,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.refresh_token) {
    return new Response(`Token exchange failed: ${JSON.stringify(data)}`, { status: 500 });
  }

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Canva подключена ✅</title></head>
<body style="font-family:monospace;padding:40px;background:#0f0f0f;color:#fff;max-width:700px">
  <h2>✅ Canva подключена!</h2>
  <p>Добавь эту строку в <strong>.env.local</strong>:</p>
  <pre style="background:#1a1a1a;padding:20px;border-radius:8px;word-break:break-all;white-space:pre-wrap">CANVA_REFRESH_TOKEN=${data.refresh_token}</pre>
  <p style="color:#888;font-size:14px">После добавления — перезапусти приложение (<code>npm run dev</code>) и иди на <a href="/canva-weekly" style="color:#a78bfa">/canva-weekly</a></p>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
