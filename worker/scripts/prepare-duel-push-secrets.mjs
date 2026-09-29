import { createECDH } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function reminderSecrets(env) {
  const names = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];
  const values = names.map(name => env[name] || '');
  if (values.every(value => !value)) return {};
  if (values.some(value => !value)) throw new Error('Configure all three Word Duel reminder secrets together.');
  const [publicKey, privateKey, subject] = values;
  if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey) || !/^[A-Za-z0-9_-]{43}$/.test(privateKey)) throw new Error('Invalid Word Duel reminder key format.');
  let matching = false;
  try {
    const pair = createECDH('prime256v1');
    pair.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    matching = pair.getPublicKey().toString('base64url') === publicKey;
  } catch { /* Never include secret input in diagnostics. */ }
  if (!matching) throw new Error('Word Duel reminder keys do not match.');
  let contact;
  try { contact = new URL(subject); } catch { throw new Error('Invalid Word Duel reminder contact.'); }
  if (!['https:', 'mailto:'].includes(contact.protocol) || contact.username || contact.password || contact.hash || subject.length > 254) throw new Error('Invalid Word Duel reminder contact.');
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
}

export async function prepareReminderSecrets(destination, env = process.env) {
  if (!destination) throw new Error('Specify a private temporary destination.');
  await writeFile(destination, JSON.stringify(reminderSecrets(env)), { mode: 0o600, flag: 'wx' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareReminderSecrets(process.argv[2]);
  console.log('Optional reminder secrets prepared for the protected Worker deployment.');
}
