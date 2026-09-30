import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerConfig = JSON.parse(await readFile(resolve(workerRoot, 'wrangler.jsonc'), 'utf8'));
const endpoint = 'https://fcm.googleapis.com/runtime-fixture-subscription';
function ephemeralKey() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  return { publicKey: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url'), privateKey: jwk.d };
}
const vapid = ephemeralKey(), receiver = ephemeralKey();
const config = { VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'mailto:fixture@example.com' };
const reminder = { lang: 'en', subscription: { endpoint, keys: { p256dh: receiver.publicKey, auth: randomBytes(16).toString('base64url') } } };

// Exercise actual encryption, signing and native fetch; all keys and endpoints are fixtures.
const bundle = await build({
  stdin: {
    resolveDir: workerRoot, loader: 'ts',
    contents: `import { sendDuelPush } from './src/word-duel-push.ts';
      export default { async fetch(request) {
        const { config, reminder } = await request.json();
        return Response.json({ result: await sendDuelPush(config, reminder, 'ABCD2345') });
      } };`,
  },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false,
});

async function runtimeCase(status, expected) {
  const outboundUrls = [];
  const runtime = new Miniflare(convertV4MiniflareOptions({
    name: 'word-duel-push-runtime-test', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: workerConfig.compatibility_date,
    compatibilityFlags: workerConfig.compatibility_flags || [],
    // Native Request/fetch processing occurs before this interceptor. No request leaves the test.
    outboundService: async request => {
      outboundUrls.push(request.url);
      assert.equal(request.url, endpoint, 'push authorization must never be sent to a redirect target');
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.get('content-encoding'), 'aes128gcm');
      assert.ok(request.headers.get('authorization')?.startsWith('vapid t='));
      assert.ok((await request.arrayBuffer()).byteLength > 86, 'encrypted push payload is present');
      return new Response(null, { status, headers: { location: 'https://untrusted.example/redirected-push' } });
    },
  }));
  try {
    const response = await runtime.dispatchFetch('https://runtime-fixture.example/push', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config, reminder }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.result, expected, `push HTTP ${status}`);
    assert.deepEqual(outboundUrls, [endpoint], `push HTTP ${status}: exactly one permitted service request`);
    console.log(`PASS Word Duel workerd: HTTP ${status} returns ${expected} without following redirects`);
  } finally { await runtime.dispose(); }
}

await runtimeCase(201, 'sent');
for (const status of [301, 302, 303, 307, 308]) await runtimeCase(status, 'failed');
for (const [status, expected] of [[404, 'gone'], [410, 'gone'], [429, 'retry'], [503, 'retry'], [400, 'failed']]) await runtimeCase(status, expected);
console.log('Word Duel native-runtime integration passed: 11 cases; ephemeral keys and no external requests.');
