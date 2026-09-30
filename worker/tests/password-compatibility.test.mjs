import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import test from 'node:test';
import { hashPassword, verifyPassword } from '../dist/security.js';
import { PasswordHasher } from '../dist/password-hasher.js';

const pepper = 'synthetic-pepper-for-compatibility';
const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const encodedSalt = salt.toString('base64url');
const vectorHash = (password, iterations) => pbkdf2Sync(
  Buffer.from(`${password}\0${pepper}`, 'utf8'), salt, iterations, 32, 'sha256',
).toString('base64url');

test('legacy and stronger password records match independent PBKDF2 SHA256 vectors byte for byte', async () => {
  for (const password of ['River lantern cedar 73', 'نهر الأرز 🌙\0مصباح ٤٢']) {
    for (const iterations of [100_000, 600_000]) {
      const record = await hashPassword(password, pepper, encodedSalt, iterations);
      assert.deepEqual(record, { hash: vectorHash(password, iterations), salt: encodedSalt, iterations });
    }
  }
});

test('strong hashing and verification succeed when native PBKDF2 rejects above the hosted cap', async t => {
  const nativeDeriveBits = crypto.subtle.deriveBits.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'deriveBits', (algorithm, ...args) => {
    if (algorithm.name === 'PBKDF2' && algorithm.iterations > 100_000) {
      throw new DOMException('PBKDF2 iteration count exceeds hosted limit', 'NotSupportedError');
    }
    return nativeDeriveBits(algorithm, ...args);
  });
  const password = 'River lantern cedar 73';
  const record = await hashPassword(password, pepper, encodedSalt);
  assert.equal(record.iterations, 600_000);
  assert.equal(record.hash, vectorHash(password, 600_000));
  assert.equal(await verifyPassword(password, pepper, record.hash, record.salt, record.iterations), true);
  assert.equal(await verifyPassword('Incorrect river lantern 39', pepper, record.hash, record.salt, record.iterations), false);
  assert.equal(await verifyPassword(password, 'different-synthetic-pepper', record.hash, record.salt, record.iterations), false);
});

test('unrelated native crypto failures propagate without silently changing the derivation path', async t => {
  t.mock.method(crypto.subtle, 'deriveBits', () => { throw new Error('synthetic crypto failure'); });
  await assert.rejects(hashPassword('River lantern cedar 73', pepper, encodedSalt, 100_000), /synthetic crypto failure/u);
});

test('the hasher still rejects unsupported iteration counts before hashing or verification', async () => {
  const hasher = new PasswordHasher({}, { PASSWORD_PEPPER: pepper });
  for (const operation of ['hash', 'verify']) {
    for (const iterations of [0, 100_001, 600_001, 1_000_000]) {
      const response = await hasher.fetch(new Request(`https://password-hasher.internal/${operation}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'River lantern cedar 73', salt: encodedSalt, expectedHash: 'A'.repeat(43), iterations }),
      }));
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'INVALID_REQUEST');
    }
  }
});
