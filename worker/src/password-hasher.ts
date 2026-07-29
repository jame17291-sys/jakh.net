import {
  hashPassword,
  PASSWORD_ITERATIONS,
  verifyPassword,
} from "./security.js";

const HASHER_SHARDS = 16;
const INTERNAL_ORIGIN = "https://password-hasher.internal";
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

export interface PasswordHashRecord {
  hash: string;
  salt: string;
  iterations: number;
}

export interface PasswordHasherRuntimeEnv {
  PASSWORD_PEPPER: string;
}

export interface PasswordHasherStub extends Rpc.DurableObjectBranded {
  fetch(request: Request): Promise<Response>;
}

export interface PasswordHasherBindingEnv {
  PASSWORD_HASHERS: DurableObjectNamespace<PasswordHasherStub>;
}

interface HashRequest {
  password: string;
  salt?: string;
  iterations?: number;
}

interface VerifyRequest {
  password: string;
  expectedHash: string;
  salt: string;
  iterations: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

function isSalt(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 20
    && value.length <= 128
    && BASE64URL_PATTERN.test(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string"
    && value.length === 43
    && BASE64URL_PATTERN.test(value);
}

function isSupportedIterations(value: unknown): value is number {
  return value === PASSWORD_ITERATIONS;
}

async function parseBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 1_024) throw new Error("Request body is too large");
  return request.json();
}

function selectStub(env: PasswordHasherBindingEnv): PasswordHasherStub {
  const random = new Uint8Array(1);
  crypto.getRandomValues(random);
  const shard = (random[0] ?? 0) % HASHER_SHARDS;
  return env.PASSWORD_HASHERS.get(
    env.PASSWORD_HASHERS.idFromName(`password-hasher-v1-${shard}`),
  );
}

async function callHasher<T>(
  env: PasswordHasherBindingEnv,
  path: "/hash" | "/verify",
  body: HashRequest | VerifyRequest,
): Promise<T> {
  const response = await selectStub(env).fetch(new Request(`${INTERNAL_ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

  if (!response.ok) {
    throw new Error(`Password hasher failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function hashPasswordInHasher(
  env: PasswordHasherBindingEnv,
  password: string,
  salt?: string,
  iterations = PASSWORD_ITERATIONS,
): Promise<PasswordHashRecord> {
  return callHasher<PasswordHashRecord>(env, "/hash", {
    password,
    ...(salt === undefined ? {} : { salt }),
    iterations,
  });
}

export async function verifyPasswordInHasher(
  env: PasswordHasherBindingEnv,
  password: string,
  expectedHash: string,
  salt: string,
  iterations: number,
): Promise<boolean> {
  const result = await callHasher<{ valid: boolean }>(env, "/verify", {
    password,
    expectedHash,
    salt,
    iterations,
  });
  return result.valid;
}

export class PasswordHasher implements DurableObject {
  constructor(
    _ctx: DurableObjectState,
    private readonly env: PasswordHasherRuntimeEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const path = new URL(request.url).pathname;
    let body: unknown;
    try {
      body = await parseBody(request);
    } catch {
      return json({ error: "Invalid request" }, 400);
    }
    if (!body || typeof body !== "object") return json({ error: "Invalid request" }, 400);

    if (path === "/hash") {
      const payload = body as Partial<HashRequest>;
      const iterations = payload.iterations ?? PASSWORD_ITERATIONS;
      if (
        !isPassword(payload.password)
        || (payload.salt !== undefined && !isSalt(payload.salt))
        || !isSupportedIterations(iterations)
      ) {
        return json({ error: "Invalid request" }, 400);
      }

      try {
        const record = await hashPassword(
          payload.password,
          this.env.PASSWORD_PEPPER,
          payload.salt,
          iterations,
        );
        return json(record);
      } catch (error) {
        console.error("Password hashing failed", error);
        return json({ error: "Password hashing failed" }, 500);
      }
    }

    if (path === "/verify") {
      const payload = body as Partial<VerifyRequest>;
      if (
        !isPassword(payload.password)
        || !isHash(payload.expectedHash)
        || !isSalt(payload.salt)
        || !isSupportedIterations(payload.iterations)
      ) {
        return json({ error: "Invalid request" }, 400);
      }

      try {
        const valid = await verifyPassword(
          payload.password,
          this.env.PASSWORD_PEPPER,
          payload.expectedHash,
          payload.salt,
          payload.iterations,
        );
        return json({ valid });
      } catch (error) {
        console.error("Password verification failed", error);
        return json({ error: "Password verification failed" }, 500);
      }
    }

    return json({ error: "Not found" }, 404);
  }
}
