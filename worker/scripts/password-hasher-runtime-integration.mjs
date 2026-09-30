import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(resolve(workerRoot, 'wrangler.jsonc'), 'utf8'));
const pepper = 'synthetic-runtime-password-pepper';
const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const bundle = await build({
  stdin: {
    resolveDir: workerRoot, loader: 'ts',
    contents: `import { PasswordHasher, hashPasswordInHasher, verifyPasswordInHasher } from './src/password-hasher.ts';
      export { PasswordHasher };
      // Local workerd has no hosted PBKDF2 ceiling. Model it explicitly so the
      // old implementation fails this regression instead of passing locally.
      const nativeDerive = crypto.subtle.deriveBits.bind(crypto.subtle);
      Object.defineProperty(crypto.subtle, 'deriveBits', { value: (algorithm, ...args) => {
        if (algorithm.name === 'PBKDF2' && algorithm.iterations > 100000)
          throw new DOMException('PBKDF2 iteration count exceeds hosted limit', 'NotSupportedError');
        return nativeDerive(algorithm, ...args);
      } });
      export default { async fetch(request, env) {
        if (new URL(request.url).pathname === '/cap') {
          const key = await crypto.subtle.importKey('raw', new Uint8Array([1]), 'PBKDF2', false, ['deriveBits']);
          try { await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array([2]),iterations:600000},key,256); }
          catch (error) { return Response.json({ capEnforced: error.name === 'NotSupportedError' }); }
          return Response.json({ capEnforced: false });
        }
        const fixture = await request.json();
        const record = await hashPasswordInHasher(env, fixture.password, fixture.salt, fixture.iterations);
        const correctAccepted = await verifyPasswordInHasher(env, fixture.password, record.hash, record.salt, record.iterations);
        const wrongRejected = !await verifyPasswordInHasher(env, 'Wrong synthetic input 93', record.hash, record.salt, record.iterations);
        return Response.json({ byteCompatible:record.hash===fixture.expectedHash, saltPreserved:record.salt===fixture.salt,
          iterations:record.iterations, correctAccepted, wrongRejected });
      } };`,
  },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false,
});
const runtime = new Miniflare(convertV4MiniflareOptions({
  name: 'password-hasher-runtime-test', modules: true, script: bundle.outputFiles[0].text,
  compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags || [],
  bindings: { PASSWORD_PEPPER: pepper },
  durableObjects: { PASSWORD_HASHERS: { className: 'PasswordHasher', useSQLite: true } },
}));
try {
  assert.deepEqual(await (await runtime.dispatchFetch('https://runtime-fixture.example/cap')).json(), { capEnforced: true });
  for (const [label, password] of [['ascii', 'River lantern cedar 73'], ['unicode', 'نهر الأرز 🌙\0مصباح ٤٢']]) {
    for (const iterations of [100_000, 600_000]) {
      const expectedHash = pbkdf2Sync(Buffer.from(`${password}\0${pepper}`, 'utf8'), salt, iterations, 32, 'sha256').toString('base64url');
      const response = await runtime.dispatchFetch('https://runtime-fixture.example/hash', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, salt: salt.toString('base64url'), iterations, expectedHash }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { byteCompatible: true, saltPreserved: true, iterations, correctAccepted: true, wrongRejected: true });
      console.log(`PASS PasswordHasher native Durable Object: ${label}, ${iterations} iterations, hosted cap modeled`);
    }
  }
  console.log('PasswordHasher native-runtime integration passed: 4 vectors through real DO bindings; no production credentials.');
} finally { await runtime.dispose(); }
