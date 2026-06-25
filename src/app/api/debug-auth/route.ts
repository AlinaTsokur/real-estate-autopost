import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuthClient } from '@/lib/google/auth';

export async function GET() {
  try {
    const auth = await getGoogleAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    const about = await drive.about.get({ fields: 'user' });
    return NextResponse.json({ email: about.data.user?.emailAddress, name: about.data.user?.displayName });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
