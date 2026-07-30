const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
} as const;
const HSTS_VALUE = "max-age=31536000";

const ERROR_CODE_BY_MESSAGE: Readonly<Record<string, string>> = Object.freeze({
  "Content-Type must be application/json": "INVALID_CONTENT_TYPE",
  "Request body is too large": "REQUEST_BODY_TOO_LARGE",
  "Invalid JSON": "INVALID_JSON",
  "Origin is not allowed": "ORIGIN_NOT_ALLOWED",
  Unauthorized: "UNAUTHORIZED",
  "Too many attempts. Please try again later.": "RATE_LIMITED",
  "Card does not match the category": "CARD_CATEGORY_MISMATCH",
  "Status does not match the card": "CARD_STATUS_MISMATCH",
  "Username is required": "USERNAME_REQUIRED",
  "Username must be 3–20 characters using letters, numbers, or underscores": "USERNAME_INVALID",
  "Invalid email": "INVALID_EMAIL",
  "API security configuration is incomplete": "API_CONFIGURATION_INCOMPLETE",
  "Username or email already exists": "USERNAME_OR_EMAIL_EXISTS",
  "Invalid credentials": "INVALID_CREDENTIALS",
  "This account has been suspended": "ACCOUNT_SUSPENDED",
  "Invalid avatar": "INVALID_AVATAR",
  "New password must be different": "NEW_PASSWORD_MUST_BE_DIFFERENT",
  "Current password is incorrect": "CURRENT_PASSWORD_INCORRECT",
  "Invalid cardId": "INVALID_CARD_ID",
  "Invalid categoryId": "INVALID_CATEGORY_ID",
  "Invalid favorite action": "INVALID_FAVORITE_ACTION",
  "Invalid sync payload": "INVALID_SYNC_PAYLOAD",
  "Invalid progress item": "INVALID_PROGRESS_ITEM",
  "Invalid favorite item": "INVALID_FAVORITE_ITEM",
  "Invalid timeSpent": "INVALID_TIME_SPENT",
  "Suggestion text is required": "SUGGESTION_REQUIRED",
  "Suggestion must be 5–2,000 characters": "SUGGESTION_INVALID",
  "Invalid category": "INVALID_CATEGORY",
  "Invalid difficulty": "INVALID_DIFFICULTY",
  "Category is unavailable": "CATEGORY_UNAVAILABLE",
  "No questions are available for this selection": "NO_QUESTIONS_AVAILABLE",
  "Could not create the battle room": "BATTLE_CREATE_FAILED",
  "Could not allocate a unique battle room": "BATTLE_ROOM_ALLOCATION_FAILED",
  "WebSocket upgrade required": "WEBSOCKET_UPGRADE_REQUIRED",
  "Invalid room code": "INVALID_ROOM_CODE",
});

function apiErrorCode(message: string, status: number): string {
  const exact = ERROR_CODE_BY_MESSAGE[message];
  if (exact) return exact;
  const passwordMatch = /^(Password|Current password|New password) (is required|must be 8–128 characters)$/u.exec(message);
  if (passwordMatch) {
    const prefix = (passwordMatch[1] || "Password").toUpperCase().replaceAll(" ", "_");
    const suffix = passwordMatch[2] === "is required" ? "REQUIRED" : "INVALID";
    return `${prefix}_${suffix}`;
  }
  if (message.startsWith("Sync is limited to ")) return "SYNC_LIMIT_EXCEEDED";
  return `HTTP_${status}_ERROR`;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly headers?: HeadersInit,
    public readonly code: string = apiErrorCode(message, status),
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(JSON_HEADERS);
  if (headers) {
    new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));
  }
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

export async function parseJson<T>(request: Request, maxBytes = 32_768): Promise<T> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "Content-Type must be application/json");
  }

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiError(413, "Request body is too large");
  }

  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";

  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        receivedBytes += value.byteLength;
        if (receivedBytes > maxBytes) {
          void reader.cancel().catch(() => undefined);
          throw new ApiError(413, "Request body is too large");
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(400, "Invalid JSON");
  }
}

export function allowedOrigins(csv: string): Set<string> {
  return new Set(csv.split(",").map((value) => value.trim()).filter(Boolean));
}

export function originIsAllowed(request: Request, csv: string): boolean {
  const origin = request.headers.get("origin");
  return !origin || allowedOrigins(csv).has(origin);
}

export function redirectToHttps(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.protocol === "https:") return null;

  url.protocol = "https:";
  return new Response(null, {
    status: 308,
    headers: {
      location: url.toString(),
      "cache-control": "no-store",
    },
  });
}

export function withCors(response: Response, request: Request, csv: string): Response {
  // Cloudflare attaches the accepted socket to its 101 Response. Reconstructing
  // that response would either reject the status or detach the socket.
  if (response.status === 101) return response;

  const headers = new Headers(response.headers);
  headers.set("strict-transport-security", HSTS_VALUE);

  const origin = request.headers.get("origin");
  if (origin && allowedOrigins(csv).has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    const vary = headers.get("vary");
    const varyTokens = vary?.split(",").map((token) => token.trim()).filter(Boolean) ?? [];
    if (!varyTokens.some((token) => token === "*" || token.toLowerCase() === "origin")) {
      headers.set("vary", [...varyTokens, "Origin"].join(", "));
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function preflight(request: Request, csv: string): Response {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins(csv).has(origin)) {
    return json({ error: "Origin is not allowed", code: "ORIGIN_NOT_ALLOWED" }, 403);
  }

  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "access-control-max-age": "86400",
      vary: "Origin",
    },
  });
}
