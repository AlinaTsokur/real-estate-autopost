// Run this file with: npx tsx scripts/generate-google-token.ts
// Ensure you have set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env.local file

import { google } from 'googleapis';
import * as readline from 'readline';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(query, resolve));
};

async function generateGoogleToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('❌ Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local first.');
    process.exit(1);
  }

  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
    prompt: 'consent' // Forces consent screen to ensure we get a refresh token
  });

  console.log('\\n=========================================================');
  console.log('Authorize this app by visiting this URL:');
  console.log('=========================================================\\n');
  console.log(authUrl);
  console.log('\\n=========================================================');

  const code = await question('Enter the code from that page here: ');

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    
    console.log('\\n✅ Authentication successful!');
    console.log('\\n=========================================================');
    console.log('YOUR GOOGLE_REFRESH_TOKEN (COPY THIS INTO .env.local):');
    console.log('=========================================================\\n');
    console.log(tokens.refresh_token);
    console.log('\\n=========================================================');
  } catch (err) {
    console.error('Error retrieving access token', err);
  }

  process.exit(0);
}

generateGoogleToken();
