import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { mkdtemp, stat, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reminderSecrets, prepareReminderSecrets } from '../scripts/prepare-duel-push-secrets.mjs';

function fixture() {
  const pair = createECDH('prime256v1'); pair.generateKeys();
  const scalar = Buffer.from(pair.getPrivateKey().toString('hex').padStart(64, '0'), 'hex');
  return { VAPID_PUBLIC_KEY: pair.getPublicKey().toString('base64url'), VAPID_PRIVATE_KEY: scalar.toString('base64url'), VAPID_SUBJECT: 'https://riddlearabia.com/about' };
}
test('release requires a complete matching VAPID pair without revealing invalid inputs', () => {
  assert.deepEqual(reminderSecrets({}), {});
  const keys = fixture();
  assert.deepEqual(reminderSecrets(keys), keys);
  for (const name of Object.keys(keys)) assert.throws(() => reminderSecrets({ ...keys, [name]: '' }), /all three/);
  assert.throws(() => reminderSecrets({ ...keys, VAPID_PRIVATE_KEY: fixture().VAPID_PRIVATE_KEY }), /do not match/);
  for (const VAPID_SUBJECT of ['file:///private/secret', 'https://private:password@host.test/', 'https://host.test/#secret', 'not a URL']) {
    assert.throws(() => reminderSecrets({ ...keys, VAPID_SUBJECT }), error => !error.message.includes(VAPID_SUBJECT));
  }
});
test('release writes only an exclusive private secret file and never replaces it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'duel-release-'));
  try {
    const file = join(dir, 'secrets.json'), keys = fixture();
    await prepareReminderSecrets(file, keys);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), keys);
    await assert.rejects(prepareReminderSecrets(file, {}), { code: 'EEXIST' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('both production deploy paths install secrets with the version and remove temporary material', async () => {
  const source = await readFile(new URL('../../.github/workflows/api-deploy.yml', import.meta.url), 'utf8');
  assert.equal((source.match(/node worker\/scripts\/prepare-duel-push-secrets.mjs/g) || []).length, 2);
  assert.equal((source.match(/--secrets-file "\$\{\{ runner.temp \}\}\/word-duel-vapid.json"/g) || []).length, 2);
  assert.equal((source.match(/run: rm -f "\$\{\{ runner.temp \}\}\/word-duel-vapid.json"/g) || []).length, 2);
  assert.ok(!source.includes('wrangler secret put VAPID'), 'avoid a separate unreceipted production version');
});
