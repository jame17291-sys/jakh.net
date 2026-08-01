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
import {
  adminOverview,
  adminSuggestions,
  adminUsers,
  updateSuggestion,
  updateUserBan,
  updateUserRole,
} from "./admin.js";
import { cleanupExpiredSecurityState } from "./db.js";
import {
  cleanupPrivacyRetentionState,
  deleteAccount,
  exportAccountData,
  getPrivacyPreferences,
  updatePrivacyPreferences,
} from "./privacy.js";
import {
  analytics,
  avatar,
  changePassword,
  deleteProgress,
  favorite,
  health,
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
import {
  cleanupExpiredVerifiedChallenges,
  createVerifiedChallenge,
  submitVerifiedChallenge,
  verifiedLeaderboard,
} from "./verified-scoring.js";
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
  if (path === "/api/user/export" && method === "GET") return exportAccountData(request, env);
  if (path === "/api/user/privacy" && method === "GET") return getPrivacyPreferences(request, env);
  if (path === "/api/user/privacy" && method === "PUT") return updatePrivacyPreferences(request, env);
  if (path === "/api/user/account" && method === "DELETE") return deleteAccount(request, env);
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
  if (path === "/api/leaderboard" && method === "GET") return verifiedLeaderboard(request, env);
  if (path === "/api/scores/verified/challenge" && method === "POST") {
    return createVerifiedChallenge(request, env);
  }
  if (path === "/api/scores/verified/submit" && method === "POST") {
    return submitVerifiedChallenge(request, env);
  }
  if (path === "/api/suggestions" && method === "POST") return suggestion(request, env);
  if (path === "/api/admin/overview" && method === "GET") return adminOverview(request, env);
  if (path === "/api/admin/users" && method === "GET") return adminUsers(request, env);
  if (path === "/api/admin/suggestions" && method === "GET") return adminSuggestions(request, env);
  const roleMatch = /^\/api\/admin\/users\/([A-Za-z0-9-]{36})\/role$/u.exec(path);
  if (roleMatch && method === "PATCH") return updateUserRole(request, env, roleMatch[1] || "");
  const banMatch = /^\/api\/admin\/users\/([A-Za-z0-9-]{36})\/ban$/u.exec(path);
  if (banMatch && method === "PATCH") return updateUserBan(request, env, banMatch[1] || "");
  const suggestionMatch = /^\/api\/admin\/suggestions\/([A-Za-z0-9-]{36})$/u.exec(path);
  if (suggestionMatch && method === "PATCH") return updateSuggestion(request, env, suggestionMatch[1] || "");
  if (path === "/api/battle/create" && method === "POST") return createBattle(request, env);
  return json({ error: "Not found", code: "NOT_FOUND" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const redirect = redirectToHttps(request, env.STATIC_ORIGIN);
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
    ctx.waitUntil(Promise.all([
      cleanupExpiredSecurityState(env),
      cleanupPrivacyRetentionState(env),
      cleanupExpiredVerifiedChallenges(env),
    ]).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
