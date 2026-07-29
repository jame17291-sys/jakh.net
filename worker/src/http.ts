const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
} as const;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly headers?: HeadersInit,
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

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiError(413, "Request body is too large");
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

export function withCors(response: Response, request: Request, csv: string): Response {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins(csv).has(origin)) return response;

  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.append("vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function preflight(request: Request, csv: string): Response {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins(csv).has(origin)) {
    return json({ error: "Origin is not allowed" }, 403);
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
