import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { createInterface } from 'readline';
import { readFileSync, writeFileSync } from 'fs';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

const ENV_FILE = '.env.local';

function updateEnv(key, value) {
  let content = readFileSync(ENV_FILE, 'utf-8');
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  writeFileSync(ENV_FILE, content, 'utf-8');
}

const API_ID = 34493835;
const API_HASH = '60dcf8942c3baefa7b30558f44ef6f2d';

console.log('\n=== Генерация нового TELEGRAM_SESSION ===\n');

const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
  connectionRetries: 3,
});

await client.start({
  phoneNumber: () => ask('Номер телефона (с +): '),
  password: () => ask('Пароль 2FA: '),
  phoneCode: () => ask('Код из Telegram: '),
  onError: (err) => console.error('Ошибка:', err),
});

const session = client.session.save();
console.log('\n✅ Новый session получен!');

updateEnv('TELEGRAM_SESSION', session);
console.log('✅ .env.local обновлён');

await client.disconnect();
rl.close();

console.log('\nТеперь запусти:');
console.log('  npx vercel env rm TELEGRAM_SESSION production');
console.log('  npx vercel env add TELEGRAM_SESSION production');
console.log('  (и вставь session который выше)');
console.log('\nSession:\n' + session);
