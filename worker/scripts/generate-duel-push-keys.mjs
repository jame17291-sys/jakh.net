import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const destination = process.argv[2];
if (!destination || process.argv.length !== 3) throw new Error('Provide one explicit private output file path. Key material is never printed.');
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const privateKey = await crypto.subtle.exportKey('jwk', pair.privateKey);
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
await writeFile(destination, `${JSON.stringify({ VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey.d }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
console.log(`VAPID keys saved privately to ${resolve(destination)}. No keys printed.`);
