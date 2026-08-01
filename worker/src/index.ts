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
  adminAudit,
  adminSecurity,
  adminSuggestions,
  adminUsers,
  reauthenticateAdmin,
  revokeNonOwnerSessions,
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
  authSession,
  avatar,
  changePassword,
  deleteProgress,
  favorite,
  health,
  login,
  logout,
  privacyRequest,
  profile,
  register,
  requireSchemaFeature,
  resetPasswordWithRecovery,
  rotateRecoveryCode,
  saveProgress,
  streak,
  suggestion,
  syncUserData,
} from "./routes.js";
import { requireSecrets } from "./security.js";
import {
  cleanupExpiredVerifiedChallenges,
  createVerifiedChallenge,
  discardServerCheckedChallenge,
  submitVerifiedChallenge,
  verifiedLeaderboard,
} from "./verified-scoring.js";
import type { Env } from "./types.js";

export { BattleRoom, PasswordHasher };

function withWorkerVersion(response: Response, env: Env): Response {
  // A Cloudflare 101 carries the accepted WebSocket. Reconstructing it would
  // reject the status or detach the socket; BattleRoom stamps that response
  // at creation time using trusted metadata forwarded by connectBattle.
  if (response.status === 101) return response;
  const versionId = env.CF_VERSION_METADATA?.id;
  if (!versionId) return response;
  const wrapped = new Response(response.body, response);
  wrapped.headers.set("x-jakh-worker-version", versionId);
  return wrapped;
}

const MAINTENANCE_JOBS = Object.freeze([
  { name: "security-state", run: cleanupExpiredSecurityState },
  { name: "privacy-retention", run: cleanupPrivacyRetentionState },
  { name: "server-checked-challenges", run: cleanupExpiredVerifiedChallenges },
] as const);

export class ScheduledMaintenanceError extends Error {
  readonly code = "SCHEDULED_MAINTENANCE_FAILED";

  constructor(readonly failedJobs: readonly string[]) {
    super(`SCHEDULED_MAINTENANCE_FAILED jobs=${failedJobs.join(",")}`);
    this.name = "ScheduledMaintenanceError";
  }
}

export async function runScheduledMaintenance(env: Env): Promise<void> {
  const results = await Promise.allSettled(
    MAINTENANCE_JOBS.map(({ run }) => Promise.resolve().then(() => run(env))),
  );
  const failedJobs: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") return;
    const job = MAINTENANCE_JOBS[index]?.name || "unknown";
    failedJobs.push(job);
    console.error("Scheduled maintenance job failed", {
      job,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  });
  if (failedJobs.length > 0) throw new ScheduledMaintenanceError(failedJobs);
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/u, "") || "/";
  const method = request.method.toUpperCase();

  if (path === "/api/health" && method === "GET") return health(env);
  requireSecrets(env.PASSWORD_PEPPER, env.IP_HASH_SALT);

  if (path === "/ws/battle" && method === "GET") return connectBattle(request, env);
  if (path === "/api/auth/register" && method === "POST") {
    await requireSchemaFeature(env, "registration");
    return register(request, env);
  }
  if (path === "/api/auth/login" && method === "POST") return login(request, env);
  if (path === "/api/auth/session" && method === "GET") return authSession(request, env);
  if (path === "/api/auth/recovery/reset" && method === "POST") {
    await requireSchemaFeature(env, "accountRecovery");
    return resetPasswordWithRecovery(request, env);
  }
  if (path === "/api/auth/logout" && method === "POST") return logout(request, env);
  if (path === "/api/user/profile" && method === "GET") return profile(request, env);
  if (path === "/api/user/export" && method === "GET") return exportAccountData(request, env);
  if (path === "/api/user/privacy" && method === "GET") return getPrivacyPreferences(request, env);
  if (path === "/api/user/privacy" && method === "PUT") return updatePrivacyPreferences(request, env);
  if (path === "/api/user/account" && method === "DELETE") {
    await requireSchemaFeature(env, "accountDeletion");
    return deleteAccount(request, env);
  }
  if (path === "/api/user/avatar" && method === "PUT") return avatar(request, env);
  if (path === "/api/auth/recovery/rotate" && method === "POST") {
    await requireSchemaFeature(env, "accountRecovery");
    return rotateRecoveryCode(request, env);
  }
  if (path === "/api/user/password" && method === "POST") return changePassword(request, env);
  if (path === "/api/user/progress" && method === "POST") return saveProgress(request, env);
  if (path === "/api/user/progress" && method === "DELETE") return deleteProgress(request, env);
  if (path === "/api/user/favorite" && method === "POST") return favorite(request, env);
  if (path === "/api/user/sync" && method === "POST") return syncUserData(request, env);
  if (path === "/api/user/streak" && method === "POST") return streak(request, env);
  if (path === "/api/analytics/time" && method === "POST") return analytics(request, env);
  if (path === "/api/leaderboard" && method === "GET") return verifiedLeaderboard(request, env);
  if (path === "/api/scores/server-checked/challenge" && method === "DELETE") {
    return discardServerCheckedChallenge(request, env);
  }
  if (
    (path === "/api/scores/server-checked/challenge"
      || path === "/api/scores/verified/challenge")
    && method === "POST"
  ) {
    return createVerifiedChallenge(request, env);
  }
  if (
    (path === "/api/scores/server-checked/submit"
      || path === "/api/scores/verified/submit")
    && method === "POST"
  ) {
    return submitVerifiedChallenge(request, env);
  }
  if (path === "/api/suggestions" && method === "POST") return suggestion(request, env);
  if (path === "/api/privacy/requests" && method === "POST") return privacyRequest(request, env);
  if (path === "/api/admin/overview" && method === "GET") return adminOverview(request, env);
  if (path === "/api/admin/users" && method === "GET") return adminUsers(request, env);
  if (path === "/api/admin/suggestions" && method === "GET") return adminSuggestions(request, env);
  if (path === "/api/admin/audit" && method === "GET") return adminAudit(request, env);
  if (path === "/api/admin/security" && method === "GET") return adminSecurity(request, env);
  if (path === "/api/admin/security/reauthenticate" && method === "POST") {
    return reauthenticateAdmin(request, env);
  }
  if (path === "/api/admin/security/revoke-non-owner-sessions" && method === "POST") {
    return revokeNonOwnerSessions(request, env);
  }
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
    if (redirect) return withWorkerVersion(redirect, env);
    if (request.method === "OPTIONS") {
      return withWorkerVersion(
        withCors(preflight(request, env.ALLOWED_ORIGINS), request, env.ALLOWED_ORIGINS),
        env,
      );
    }
    if (!originIsAllowed(request, env.ALLOWED_ORIGINS)) {
      return withWorkerVersion(
        withCors(
          json({ error: "Origin is not allowed", code: "ORIGIN_NOT_ALLOWED" }, 403),
          request,
          env.ALLOWED_ORIGINS,
        ),
        env,
      );
    }

    try {
      const response = await route(request, env);
      return withWorkerVersion(withCors(response, request, env.ALLOWED_ORIGINS), env);
    } catch (error) {
      if (error instanceof ApiError) {
        return withWorkerVersion(
          withCors(
            json({ error: error.message, code: error.code }, error.status, error.headers),
            request,
            env.ALLOWED_ORIGINS,
          ),
          env,
        );
      }
      console.error("Unhandled API error", error);
      return withWorkerVersion(
        withCors(
          json({ error: "Internal server error", code: "INTERNAL_SERVER_ERROR" }, 500),
          request,
          env.ALLOWED_ORIGINS,
        ),
        env,
      );
    }
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const maintenance = runScheduledMaintenance(env);
    ctx.waitUntil(maintenance);
    await maintenance;
  },
} satisfies ExportedHandler<Env>;
