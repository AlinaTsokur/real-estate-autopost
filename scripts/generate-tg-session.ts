// Run this file with: npx tsx scripts/generate-tg-session.ts
// Ensure you have set TELEGRAM_API_ID and TELEGRAM_API_HASH in your .env.local file

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
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

async function generateSession() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
  const apiHash = process.env.TELEGRAM_API_HASH || '';

  if (!apiId || !apiHash) {
    console.error('❌ Please add TELEGRAM_API_ID and TELEGRAM_API_HASH to .env.local first.');
    process.exit(1);
  }

  console.log('Generating Telegram Session...');
  const stringSession = new StringSession(''); 

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await question('Please enter your phone number (e.g., +971501234567): '),
    password: async () => await question('Please enter your 2FA password (if you have one, otherwise press Enter): '),
    phoneCode: async () => await question('Please enter the code you received in Telegram: '),
    onError: (err) => console.log(err),
  });

  console.log('\\n✅ You are successfully logged in!');
  const sessionString = client.session.save();
  console.log('\\n=========================================================');
  console.log('YOUR TELEGRAM_SESSION STRING (COPY THIS INTO .env.local):');
  console.log('=========================================================\\n');
  console.log(sessionString as unknown as string);
  console.log('\\n=========================================================');
  
  await client.disconnect();
  process.exit(0);
}

generateSession();
