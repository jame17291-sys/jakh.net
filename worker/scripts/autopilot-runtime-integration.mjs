import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(resolve(workerRoot, 'wrangler.jsonc'), 'utf8'));
const JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'runtime-fixture-key', use: 'sig', alg: 'RS256' };
const sourceSha = 'a'.repeat(40);

function identityToken(signingKey = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'https://token.actions.githubusercontent.com', aud: 'https://api.riddlearabia.com/autopilot',
    repository: 'jame17291-sys/jakh.net', repository_id: '1227088138', repository_owner_id: '281123018',
    ref: 'refs/heads/main', ref_type: 'branch', ref_protected: 'true', sha: sourceSha, workflow_sha: sourceSha,
    runner_environment: 'github-hosted', event_name: 'workflow_dispatch', run_id: '1001', run_attempt: '1',
    workflow_ref: 'jame17291-sys/jakh.net/.github/workflows/site-autopilot.yml@refs/heads/main',
    jti: 'runtime-fixture-token', iat: now, nbf: now, exp: now + 300,
  };
  const input = [{ alg: 'RS256', kid: jwk.kid }, claims]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), signingKey).toString('base64url')}`;
}

// Bundle the actual production verifier. Only the outer HTTP test adapter is synthetic.
// Native workerd fetch validates Request options before the outbound fixture sees them.
const bundle = await build({
  stdin: {
    resolveDir: workerRoot,
    loader: 'ts',
    contents: `import { verifyAutopilotIdentity } from './src/autopilot.ts';
      export default { async fetch(request) {
        try { return Response.json({ identity: await verifyAutopilotIdentity(request) }); }
        catch (error) { return Response.json({ code: error.code || 'UNEXPECTED_ERROR' }, { status: error.status || 500 }); }
      } };`,
  },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false,
});

async function runtimeCase({ name, keyStatus = 200, signingKey, expectedStatus, expectedCode }) {
  const outboundUrls = [];
  const runtime = new Miniflare(convertV4MiniflareOptions({
    name: 'autopilot-identity-runtime-test',
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags || [],
    // Intercept only after native fetch option handling; never make a real network request.
    outboundService: async request => {
      outboundUrls.push(request.url);
      assert.equal(request.url, JWKS_URL, 'token verification must never follow the redirect target');
      if (keyStatus !== 200) return new Response(null, {
        status: keyStatus, headers: { location: 'https://untrusted.example/redirected-keys' },
      });
      return Response.json({ keys: [jwk] });
    },
  }));
  try {
    const response = await runtime.dispatchFetch('https://api.riddlearabia.com/api/internal/autopilot/claim', {
      method: 'POST', headers: { authorization: `Bearer ${identityToken(signingKey)}` },
    });
    const result = await response.json();
    assert.equal(response.status, expectedStatus, `${name}: ${result.code || 'unexpected status'}`);
    assert.deepEqual(outboundUrls, [JWKS_URL], `${name}: exactly one fixed public-key request`);
    if (expectedCode) assert.equal(result.code, expectedCode, name);
    else assert.deepEqual(result.identity, { runId: '1001', runAttempt: '1', sourceSha, stage: 'maintenance' });
    console.log(`PASS Autopilot workerd: ${name}`);
  } finally { await runtime.dispose(); }
}

await runtimeCase({ name: 'valid RSA identity through native fetch', expectedStatus: 200 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
await runtimeCase({ name: 'forged RSA signature rejected', signingKey: other.privateKey,
  expectedStatus: 401, expectedCode: 'AUTOPILOT_IDENTITY_INVALID' });
for (const keyStatus of [301, 302, 303, 307, 308, 503]) {
  await runtimeCase({ name: `JWKS HTTP ${keyStatus} rejected without following`, keyStatus,
    expectedStatus: 503, expectedCode: 'AUTOPILOT_IDENTITY_UNAVAILABLE' });
}
console.log('Autopilot native-runtime integration passed: 8 cases; no production tokens or network requests.');
