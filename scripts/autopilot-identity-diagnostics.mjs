const JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks';

function decodeSegment(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('invalid segment');
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// This is diagnostic evidence, never authorization. No token, claim, key,
// remote response text or exception message is included in the result.
export async function diagnoseIdentityToken(token, { fetchImpl = fetch, cryptoImpl = globalThis.crypto } = {}) {
  const result = {
    version: 1,
    stage: 'token_format_invalid',
    authorizationSizeAccepted: typeof token === 'string' && token.length + 'Bearer '.length <= 16_384,
    headerPolicyAccepted: false,
    headerFlags: { jku: false, jwk: false, x5u: false, crit: false },
    signatureVerified: false,
  };
  const finish = stage => ({ ...result, stage });
  if (typeof token !== 'string' || token.length > 20_000) return finish('token_format_invalid');
  let header, encodedHeader, encodedClaims, signature;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return finish('token_format_invalid');
    [encodedHeader, encodedClaims] = parts;
    header = JSON.parse(new TextDecoder().decode(decodeSegment(encodedHeader)));
    const claims = JSON.parse(new TextDecoder().decode(decodeSegment(encodedClaims)));
    signature = decodeSegment(parts[2]);
    if (!isRecord(header) || !isRecord(claims)) return finish('token_format_invalid');
  } catch { return finish('token_format_invalid'); }

  for (const name of Object.keys(result.headerFlags)) result.headerFlags[name] = Boolean(header[name]);
  const keyIdAccepted = typeof header.kid === 'string' && header.kid.length <= 128;
  result.headerPolicyAccepted = header.alg === 'RS256' && keyIdAccepted
    && !Object.values(result.headerFlags).some(Boolean);
  if (header.alg !== 'RS256') return finish('algorithm_rejected');
  if (!keyIdAccepted) return finish('key_id_rejected');

  // Even when a token contains a forbidden key reference, verify its signature
  // independently against this fixed endpoint. Never follow token-controlled URLs.
  let response;
  try {
    response = await fetchImpl(JWKS_URL, { redirect: 'error', signal: AbortSignal.timeout(5_000) });
  } catch { return finish('jwks_fetch_failed'); }
  if (!response.ok) return finish('jwks_http_error');
  let keySet;
  try {
    const body = await response.text();
    if (body.length > 65_536) return finish('jwks_payload_invalid');
    keySet = JSON.parse(body);
    if (!isRecord(keySet) || !Array.isArray(keySet.keys) || keySet.keys.length > 20
      || !keySet.keys.every(isRecord)) return finish('jwks_payload_invalid');
  } catch { return finish('jwks_payload_invalid'); }
  const key = keySet.keys.find(entry => entry.kid === header.kid && entry.kty === 'RSA'
    && entry.use === 'sig' && (!entry.alg || entry.alg === 'RS256'));
  if (!key) return finish('signing_key_missing');
  let imported;
  try {
    imported = await cryptoImpl.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  } catch { return finish('key_import_failed'); }
  try {
    result.signatureVerified = await cryptoImpl.subtle.verify('RSASSA-PKCS1-v1_5', imported,
      signature, new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`)) === true;
  } catch { return finish('signature_check_failed'); }
  if (!result.signatureVerified) return finish('signature_invalid');
  if (!result.authorizationSizeAccepted) return finish('authorization_too_large');
  if (!result.headerPolicyAccepted) return finish('header_policy_rejected');
  return finish('signature_verified');
}
