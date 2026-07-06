import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'crypto';

function base64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function GET() {
  const clientId = process.env.CANVA_CLIENT_ID;
  if (!clientId) return new Response('CANVA_CLIENT_ID not configured', { status: 500 });

  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());

  const cookieStore = await cookies();
  cookieStore.set('canva_code_verifier', codeVerifier, { httpOnly: true, maxAge: 600, path: '/' });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: 'http://127.0.0.1:3000/api/canva-oauth/callback',
    scope: 'design:content:read',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  redirect(`https://www.canva.com/api/oauth/authorize?${params}`);
}
