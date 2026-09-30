import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { diagnoseIdentityToken } from './autopilot-identity-diagnostics.mjs';
import { diagnoseAutopilotIdentity, API_ORIGIN, REPOSITORY, REPOSITORY_ID } from './autopilot-client.mjs';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'synthetic-diagnostic-key', use: 'sig', alg: 'RS256' };
const PRIVATE_MARKER = 'never-emit-token-or-claim-data';
const JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks';
function token(header = {}, claims = { private: PRIVATE_MARKER }, signingKey = keys.privateKey) {
  const payload = [{ alg: 'RS256', kid: publicKey.kid, ...header }, claims]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return `${payload}.${sign('RSA-SHA256', Buffer.from(payload), signingKey).toString('base64url')}`;
}
function fetchKeys(value = { keys: [publicKey] }, status = 200) {
  return async (url, options) => {
    assert.equal(url, JWKS_URL);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(value, { status });
  };
}
function safeShape(result) {
  assert.deepEqual(Object.keys(result).sort(), ['version', 'stage', 'authorizationSizeAccepted', 'headerPolicyAccepted', 'headerFlags', 'signatureVerified'].sort());
  assert.equal(result.version, 1);
  assert.match(result.stage, /^[a-z_]+$/u);
  for (const name of ['authorizationSizeAccepted', 'headerPolicyAccepted', 'signatureVerified']) assert.equal(typeof result[name], 'boolean');
  assert.deepEqual(Object.keys(result.headerFlags), ['jku', 'jwk', 'x5u', 'crit']);
  assert.ok(Object.values(result.headerFlags).every(value => typeof value === 'boolean'));
  assert.doesNotMatch(JSON.stringify(result), /never-emit|synthetic-diagnostic-key|attacker\.example/);
}

test('runner diagnostic verifies a real RSA signature without publishing claims or key material', async () => {
  const result = await diagnoseIdentityToken(token(), { fetchImpl: fetchKeys() });
  assert.equal(result.stage, 'signature_verified');
  assert.equal(result.headerPolicyAccepted, true);
  assert.equal(result.signatureVerified, true);
  safeShape(result);
});

test('forbidden header references are identified only by booleans and never control key retrieval', async () => {
  for (const [name, value] of [['jku', 'https://attacker.example/keys'], ['jwk', { private: PRIVATE_MARKER }], ['x5u', 'https://attacker.example/cert'], ['crit', ['private']]]) {
    const result = await diagnoseIdentityToken(token({ [name]: value }), { fetchImpl: fetchKeys() });
    assert.equal(result.stage, 'header_policy_rejected');
    assert.equal(result.headerFlags[name], true);
    assert.equal(result.headerPolicyAccepted, false);
    assert.equal(result.signatureVerified, true, 'metadata is not trusted until the fixed GitHub key verifies the signature');
    safeShape(result);
  }
});

test('forged signatures and token formats cannot produce a signature-verified result', async () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const forged = await diagnoseIdentityToken(token({ jku: 'https://attacker.example' }, undefined, other.privateKey), { fetchImpl: fetchKeys() });
  assert.equal(forged.stage, 'signature_invalid');
  assert.equal(forged.signatureVerified, false);
  safeShape(forged);
  for (const value of [null, '', 'not.a.jwt', 'x'.repeat(20_001), token({}, null), token({}, []), token({ alg: 'HS256' }), token({ kid: null })]) {
    const result = await diagnoseIdentityToken(value, { fetchImpl: async () => assert.fail('invalid tokens must not fetch keys') });
    assert.equal(result.signatureVerified, false);
    assert.notEqual(result.stage, 'signature_verified');
    safeShape(result);
  }
});

test('authorization size diagnostic distinguishes a signed token rejected by the API length limit', async () => {
  const oversized = token({}, { private: 'x'.repeat(12_200) });
  assert.ok(oversized.length + 7 > 16_384 && oversized.length <= 20_000);
  const result = await diagnoseIdentityToken(oversized, { fetchImpl: fetchKeys() });
  assert.equal(result.stage, 'authorization_too_large');
  assert.equal(result.authorizationSizeAccepted, false);
  assert.equal(result.signatureVerified, true);
  safeShape(result);
});

test('runner and API diagnostic use the same fresh token exactly once without ever making an ordinary claim', async () => {
  const identity = token({ jku: 'https://attacker.example/metadata' });
  const env = {
    GITHUB_REPOSITORY: REPOSITORY, GITHUB_REPOSITORY_ID: REPOSITORY_ID,
    GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true', GITHUB_SHA: 'a'.repeat(40),
    GITHUB_RUN_ID: '12345', GITHUB_EVENT_NAME: 'workflow_dispatch',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/identity',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: PRIVATE_MARKER,
  };
  let issued = 0, keyRequests = 0, apiRequests = 0;
  const result = await diagnoseAutopilotIdentity(env, async (input, options) => {
    const url = String(input);
    if (url.startsWith(env.ACTIONS_ID_TOKEN_REQUEST_URL)) {
      issued++;
      return Response.json({ value: identity });
    }
    if (url === JWKS_URL) {
      keyRequests++;
      assert.equal(options.redirect, 'error');
      return Response.json({ keys: [publicKey] });
    }
    assert.equal(url, `${API_ORIGIN}/api/internal/autopilot/claim`);
    apiRequests++;
    assert.equal(options.headers.authorization === `Bearer ${identity}`, true, 'the API must receive the token already verified locally');
    assert.deepEqual(JSON.parse(options.body), { diagnosticOnly: true });
    return Response.json({ code: 'AUTOPILOT_IDENTITY_INVALID', error: PRIVATE_MARKER }, { status: 401 });
  });
  assert.equal(issued, 1);
  assert.equal(keyRequests, 1);
  assert.equal(apiRequests, 1);
  assert.equal(result.status, 'failed', 'a runner signature check is never API authorization');
  assert.equal(result.code, 'AUTOPILOT_IDENTITY_INVALID');
  assert.equal(result.runner.stage, 'header_policy_rejected');
  assert.equal(result.runner.signatureVerified, true);
  assert.equal(result.runner.headerFlags.jku, true);
  safeShape(result.runner);
  assert.doesNotMatch(JSON.stringify(result), /never-emit|synthetic-diagnostic-key|attacker\.example|Bearer /);
});

test('key retrieval and cryptography failures become fixed stages without remote error details', async () => {
  const cases = [
    [{ fetchImpl: async () => { throw Error(PRIVATE_MARKER); } }, 'jwks_fetch_failed'],
    [{ fetchImpl: fetchKeys({ error: PRIVATE_MARKER }, 503) }, 'jwks_http_error'],
    [{ fetchImpl: async () => new Response(PRIVATE_MARKER) }, 'jwks_payload_invalid'],
    [{ fetchImpl: async () => new Response('x'.repeat(65_537)) }, 'jwks_payload_invalid'],
    [{ fetchImpl: fetchKeys({ keys: Array(21).fill(publicKey) }) }, 'jwks_payload_invalid'],
    [{ fetchImpl: fetchKeys({ keys: [null] }) }, 'jwks_payload_invalid'],
    [{ fetchImpl: fetchKeys({ keys: [] }) }, 'signing_key_missing'],
    [{ fetchImpl: fetchKeys({ keys: [{ ...publicKey, use: 'enc' }] }) }, 'signing_key_missing'],
    [{ fetchImpl: fetchKeys({ keys: [{ ...publicKey, alg: 'RS512' }] }) }, 'signing_key_missing'],
    [{ fetchImpl: fetchKeys({ keys: [{ ...publicKey, e: undefined }] }) }, 'key_import_failed'],
    [{ fetchImpl: fetchKeys(), cryptoImpl: { subtle: { importKey: async () => ({}), verify: async () => { throw Error(PRIVATE_MARKER); } } } }, 'signature_check_failed'],
  ];
  for (const [options, stage] of cases) {
    const result = await diagnoseIdentityToken(token(), options);
    assert.equal(result.stage, stage);
    assert.equal(result.signatureVerified, false);
    safeShape(result);
  }
});
