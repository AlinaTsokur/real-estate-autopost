import { google } from 'googleapis';

export async function getGoogleAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google OAuth credentials (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN) missing in .env.local');
  }

  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob' // Out of band redirect for manual code entry
  );

  oAuth2Client.setCredentials({
    refresh_token: refreshToken
  });

  return oAuth2Client;
}
