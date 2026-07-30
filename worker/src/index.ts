import { connectBattle, createBattle } from "./battle.js";
import { BattleRoom } from "./battle-room.js";
import {
  ApiError,
  json,
  originIsAllowed,
  preflight,
  redirectToHttps,
  withCors,
} from "./http.js";
import { PasswordHasher } from "./password-hasher.js";
import { cleanupExpiredSecurityState } from "./db.js";
import {
  analytics,
  avatar,
  changePassword,
  deleteProgress,
  favorite,
  health,
  leaderboard,
  login,
  logout,
  profile,
  register,
  saveProgress,
  streak,
  suggestion,
  syncUserData,
} from "./routes.js";
import { requireSecrets } from "./security.js";
import type { Env } from "./types.js";

export { BattleRoom, PasswordHasher };

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/u, "") || "/";
  const method = request.method.toUpperCase();

  if (path === "/api/health" && method === "GET") return health(env);
  requireSecrets(env.PASSWORD_PEPPER, env.IP_HASH_SALT);

  if (path === "/ws/battle" && method === "GET") return connectBattle(request, env);
  if (path === "/api/auth/register" && method === "POST") return register(request, env);
  if (path === "/api/auth/login" && method === "POST") return login(request, env);
  if (path === "/api/auth/logout" && method === "POST") return logout(request, env);
  if (path === "/api/user/profile" && method === "GET") return profile(request, env);
  if (path === "/api/user/avatar" && method === "PUT") return avatar(request, env);
  if (path === "/api/user/password" && method === "POST") return changePassword(request, env);
  if (path === "/api/user/progress" && method === "POST") return saveProgress(request, env);
  if (path === "/api/user/progress" && method === "DELETE") return deleteProgress(request, env);
  if (path === "/api/user/favorite" && method === "POST") return favorite(request, env);
  if (path === "/api/user/sync" && method === "POST") return syncUserData(request, env);
  if (
    path === "/api/user/streak"
    && (
      method === "POST"
      || (method === "GET" && Boolean(request.headers.get("origin")))
    )
  ) return streak(request, env);
  if (path === "/api/analytics/time" && method === "POST") return analytics(request, env);
  if (path === "/api/leaderboard" && method === "GET") return leaderboard(env);
  if (path === "/api/suggestions" && method === "POST") return suggestion(request, env);
  if (path === "/api/battle/create" && method === "POST") return createBattle(request, env);
  return json({ error: "Not found", code: "NOT_FOUND" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const redirect = redirectToHttps(request);
    if (redirect) return redirect;
    if (request.method === "OPTIONS") {
      return withCors(preflight(request, env.ALLOWED_ORIGINS), request, env.ALLOWED_ORIGINS);
    }
    if (!originIsAllowed(request, env.ALLOWED_ORIGINS)) {
      return withCors(
        json({ error: "Origin is not allowed", code: "ORIGIN_NOT_ALLOWED" }, 403),
        request,
        env.ALLOWED_ORIGINS,
      );
    }

    try {
      const response = await route(request, env);
      return withCors(response, request, env.ALLOWED_ORIGINS);
    } catch (error) {
      if (error instanceof ApiError) {
        return withCors(
          json({ error: error.message, code: error.code }, error.status, error.headers),
          request,
          env.ALLOWED_ORIGINS,
        );
      }
      console.error("Unhandled API error", error);
      return withCors(
        json({ error: "Internal server error", code: "INTERNAL_SERVER_ERROR" }, 500),
        request,
        env.ALLOWED_ORIGINS,
      );
    }
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(cleanupExpiredSecurityState(env));
  },
} satisfies ExportedHandler<Env>;
