import { createPrivateKey, sign } from "node:crypto";

const API_ORIGIN = "https://api.github.com";
const REPOSITORY = "jame17291-sys/jakh.net";
const REPOSITORY_ID = 1227088138;
const OWNER_ID = 281123018;
const TOKEN_PERMISSIONS = Object.freeze({ contents: "write", pull_requests: "write" });
const MAX_RESPONSE_BYTES = 256_000;

function numericId(value, label) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,15}$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`A valid ${label} is required for the repository-scoped maintenance App.`);
  }
  return Number(value);
}
function clock(now) {
  const value = now();
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid GitHub App signing time.");
  return Math.floor(value / 1000);
}
function encode(value) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }

/** GitHub App authentication lasts at most ten minutes, including clock skew. */
export function createAppJwt({ appId, privateKey, now = Date.now }) {
  numericId(appId, "GitHub App ID");
  if (typeof privateKey !== "string" || privateKey.length > 32_768) throw new Error("A valid RSA GitHub App private key is required.");
  let key;
  try {
    key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength || 0) < 2048) throw new Error("Invalid key");
  } catch {
    // Crypto parsing errors can include input details; never propagate them.
    throw new Error("A valid RSA GitHub App private key is required.");
  }
  const seconds = clock(now);
  const payload = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: seconds - 60, exp: seconds + 540, iss: appId })}`;
  return `${payload}.${sign("RSA-SHA256", Buffer.from(payload), key).toString("base64url")}`;
}
function exactPermissions(permissions) {
  return permissions && typeof permissions === "object" && !Array.isArray(permissions)
    && permissions.contents === "write" && permissions.pull_requests === "write"
    && Object.entries(permissions).every(([key, value]) => key === "metadata" ? value === "read" : TOKEN_PERMISSIONS[key] === value);
}
function usableToken(token) {
  // Installation tokens now also have a variable-length stateless JWT format.
  // Treat them as opaque, and only reject unsafe header characters and size.
  return typeof token === "string" && token.length >= 20 && token.length <= 20_000 && !/[\s\x00-\x1f\x7f]/u.test(token);
}
function safeRequestError(label, status) {
  const error = new Error(status ? `${label} failed (HTTP ${status}).` : `${label} failed; no credentials were printed.`);
  if (status) error.status = status;
  return error;
}
async function request(fetchImpl, path, bearer, { method = "GET", body, empty = false } = {}) {
  let response;
  try {
    response = await fetchImpl(`${API_ORIGIN}${path}`, {
      method, redirect: "error", signal: AbortSignal.timeout(25_000),
      headers: { authorization: `Bearer ${bearer}`, accept: "application/vnd.github+json", "content-type": "application/json",
        "x-github-api-version": "2022-11-28", "user-agent": "riddle-arabia-autopilot/1" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch { throw safeRequestError("GitHub App request"); }
  if (!response.ok) throw safeRequestError("GitHub App request", response.status);
  if (empty) {
    if (response.status !== 204) throw safeRequestError("GitHub App token revocation", response.status);
    return null;
  }
  if (Number(response.headers.get("content-length") || 0) > MAX_RESPONSE_BYTES) throw new Error("GitHub App response exceeds the bounded size.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("GitHub App response was empty.");
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("GitHub App response exceeds the bounded size.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error.message === "GitHub App response exceeds the bounded size.") throw error;
    throw safeRequestError("GitHub App response read");
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text); }
  catch { throw new Error("GitHub App returned invalid JSON; no response content was printed."); }
}

/** Mint only when a verified repair is ready to push; revoke immediately after PR creation. */
export async function mintAutopilotAppToken({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const appId = numericId(env.AUTOPILOT_GITHUB_APP_ID, "GitHub App ID");
  const installationId = numericId(env.AUTOPILOT_GITHUB_APP_INSTALLATION_ID, "GitHub App installation ID");
  const jwt = createAppJwt({ appId: String(appId), privateKey: env.AUTOPILOT_GITHUB_APP_PRIVATE_KEY, now });
  const installation = await request(fetchImpl, `/app/installations/${installationId}`, jwt);
  if (installation?.id !== installationId || installation.app_id !== appId || installation.account?.id !== OWNER_ID
    || installation.repository_selection !== "selected" || installation.suspended_at !== null
    || !exactPermissions(installation.permissions)) {
    throw new Error("GitHub App installation must belong to the website owner, select repositories, and grant only contents and pull-request writes.");
  }
  const result = await request(fetchImpl, `/app/installations/${installationId}/access_tokens`, jwt, {
    method: "POST", body: { repository_ids: [REPOSITORY_ID], permissions: TOKEN_PERMISSIONS },
  });
  const token = result?.token;
  if (!usableToken(token)) throw new Error("GitHub App returned an invalid installation credential.");
  let revoked = false;
  let pendingRevoke;
  const revoke = async () => {
    if (revoked) return;
    if (pendingRevoke) return pendingRevoke;
    pendingRevoke = request(fetchImpl, "/installation/token", token, { method: "DELETE", empty: true })
      .then(() => { revoked = true; })
      .finally(() => { pendingRevoke = undefined; });
    return pendingRevoke;
  };
  try {
    const expiry = Date.parse(result.expires_at);
    const seconds = clock(now);
    const repository = result.repositories?.[0];
    if (!Number.isFinite(expiry) || expiry <= (seconds + 300) * 1000 || expiry > (seconds + 3660) * 1000
      || !exactPermissions(result.permissions) || result.repository_selection !== "selected"
      || !Array.isArray(result.repositories) || result.repositories.length !== 1
      || repository?.id !== REPOSITORY_ID || repository.full_name !== REPOSITORY
      || repository.owner?.id !== OWNER_ID || repository.private !== false) {
      throw new Error("GitHub App token must be short lived and limited to this public website repository with only contents and pull-request writes.");
    }
    // Prevent accidental serialization/logging of an opaque credential.
    return Object.defineProperty({ expiresAt: new Date(expiry).toISOString(), revoke }, "token", { value: token, enumerable: false });
  } catch (error) {
    try { await revoke(); }
    catch { throw new Error("GitHub App token validation and credential cleanup failed; disable the installation before retrying."); }
    throw error;
  }
}
