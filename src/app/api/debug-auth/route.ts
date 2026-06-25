import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuthClient } from '@/lib/google/auth';

export async function GET() {
  try {
    const auth = await getGoogleAuthClient();
    const oauth2 = google.oauth2({ version: 'v2', auth });
    const info = await oauth2.userinfo.get();
    return NextResponse.json({ email: info.data.email });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
