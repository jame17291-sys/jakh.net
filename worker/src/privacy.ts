import { enforceRateLimit, requireUser } from "./db.js";
import { ApiError, json, parseJson } from "./http.js";
import { verifyPasswordInHasher } from "./password-hasher.js";
import {
  clearSessionCookies,
  clientIp,
  sha256,
  validatePassword,
} from "./security.js";
import type { Env, SessionUser } from "./types.js";

export const PRIVACY_NOTICE_VERSION = "2026-07-31";
const ACCOUNT_ANALYTICS_RETENTION_MONTHS = 13;
const SUGGESTION_IP_RETENTION_DAYS = 30;
const SUGGESTION_RETENTION_MONTHS = 12;

interface AccountExportRow {
  id: string;
  username: string;
  email: string | null;
  avatar: string;
  role: string;
  streak_freeze_count: number;
  streak_freeze_highest: number;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

interface PrivacyPreferenceRow {
  usage_analytics_enabled: number;
  notice_version: string;
  consent_updated_at: string;
}

function now(): string {
  return new Date().toISOString();
}

function privacyPreferencePayload(row: PrivacyPreferenceRow | null): {
  analytics: "allowed" | "denied";
  usageAnalyticsEnabled: boolean;
  noticeVersion: string;
  consentUpdatedAt: string | null;
  needsRenewal: boolean;
} {
  const consentIsCurrent = row?.notice_version === PRIVACY_NOTICE_VERSION;
  const usageAnalyticsEnabled = consentIsCurrent
    && row?.usage_analytics_enabled === 1;
  return {
    analytics: usageAnalyticsEnabled ? "allowed" : "denied",
    usageAnalyticsEnabled,
    noticeVersion: PRIVACY_NOTICE_VERSION,
    consentUpdatedAt: row?.consent_updated_at || null,
    needsRenewal: Boolean(row?.usage_analytics_enabled === 1 && !consentIsCurrent),
  };
}

async function privacyPreference(
  env: Env,
  userId: string,
): Promise<PrivacyPreferenceRow | null> {
  return env.DB.prepare(
    `SELECT usage_analytics_enabled, notice_version, consent_updated_at
       FROM privacy_preferences
      WHERE user_id = ?`,
  ).bind(userId).first<PrivacyPreferenceRow>();
}

async function privacyRateKey(
  request: Request,
  env: Env,
  session: SessionUser,
  scope: string,
): Promise<string> {
  return sha256(
    `${env.IP_HASH_SALT}:privacy:${scope}:${session.id}:${clientIp(request)}`,
  );
}

function responseWithClearedSessionCookies(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const cookie of clearSessionCookies()) headers.append("set-cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function getPrivacyPreferences(
  request: Request,
  env: Env,
): Promise<Response> {
  const user = await requireUser(request, env);
  return json({
    privacy: privacyPreferencePayload(await privacyPreference(env, user.id)),
  });
}

export async function updatePrivacyPreferences(
  request: Request,
  env: Env,
): Promise<Response> {
  const user = await requireUser(request, env);
  await enforceRateLimit(
    env,
    await privacyRateKey(request, env, user, "preferences"),
    60,
    60 * 60,
  );
  const body = await parseJson<{ analytics?: unknown }>(request, 2_048);
  if (body.analytics !== "allowed" && body.analytics !== "denied") {
    throw new ApiError(
      400,
      "analytics must be allowed or denied",
      undefined,
      "PRIVACY_PREFERENCE_INVALID",
    );
  }
  const usageAnalyticsEnabled = body.analytics === "allowed";

  const timestamp = now();
  const preferenceStatement = env.DB.prepare(
    `INSERT INTO privacy_preferences (
      user_id, usage_analytics_enabled, notice_version, consent_updated_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      usage_analytics_enabled = excluded.usage_analytics_enabled,
      notice_version = excluded.notice_version,
      consent_updated_at = excluded.consent_updated_at,
      updated_at = excluded.updated_at`,
  ).bind(
    user.id,
    usageAnalyticsEnabled ? 1 : 0,
    PRIVACY_NOTICE_VERSION,
    timestamp,
    timestamp,
    timestamp,
  );

  if (usageAnalyticsEnabled) {
    await preferenceStatement.run();
  } else {
    await env.DB.batch([
      preferenceStatement,
      env.DB.prepare("DELETE FROM analytics_daily WHERE user_id = ?").bind(user.id),
    ]);
  }

  return json({
    success: true,
    privacy: {
      analytics: body.analytics,
      usageAnalyticsEnabled,
      noticeVersion: PRIVACY_NOTICE_VERSION,
      consentUpdatedAt: timestamp,
      needsRenewal: false,
    },
    existingUsageAnalyticsDeleted: !usageAnalyticsEnabled,
  });
}

export async function exportAccountData(
  request: Request,
  env: Env,
): Promise<Response> {
  const user = await requireUser(request, env);
  await enforceRateLimit(
    env,
    await privacyRateKey(request, env, user, "export"),
    12,
    60 * 60,
  );

  const [
    account,
    progressResult,
    favoritesResult,
    analyticsResult,
    verifiedScoresResult,
    suggestionsResult,
    preference,
  ] = await Promise.all([
    env.DB.prepare(
      `SELECT id, username, email, avatar, role, streak_freeze_count,
              streak_freeze_highest, created_at, updated_at, last_login_at
         FROM users
        WHERE id = ?`,
    ).bind(user.id).first<AccountExportRow>(),
    env.DB.prepare(
      `SELECT card_id AS cardId, category_id AS categoryId, status,
              first_correct_at AS firstCorrectAt, created_at AS createdAt,
              updated_at AS updatedAt
         FROM progress
        WHERE user_id = ?
        ORDER BY created_at, card_id`,
    ).bind(user.id).all(),
    env.DB.prepare(
      `SELECT card_id AS cardId, category_id AS categoryId, created_at AS createdAt
         FROM favorites
        WHERE user_id = ?
        ORDER BY created_at, card_id`,
    ).bind(user.id).all(),
    env.DB.prepare(
      `SELECT page_slug AS pageSlug, activity_date AS activityDate,
              time_spent AS timeSpentSeconds, updated_at AS updatedAt
         FROM analytics_daily
        WHERE user_id = ?
        ORDER BY activity_date, page_slug`,
    ).bind(user.id).all(),
    env.DB.prepare(
      `SELECT id, category_id AS categoryId, question_count AS questionCount,
              started_at AS startedAt, expires_at AS expiresAt, status,
              correct_count AS correctCount, score, elapsed_ms AS elapsedMs,
              completed_at AS completedAt, verified, created_at AS createdAt
         FROM verified_score_sessions
        WHERE user_id = ?
        ORDER BY created_at, id`,
    ).bind(user.id).all(),
    env.DB.prepare(
      `SELECT id, text, email, status, created_at AS createdAt
         FROM suggestions
        WHERE user_id = ?
        ORDER BY created_at, id`,
    ).bind(user.id).all(),
    privacyPreference(env, user.id),
  ]);

  if (!account) {
    throw new ApiError(404, "Account not found", undefined, "ACCOUNT_NOT_FOUND");
  }

  const generatedAt = now();
  return json({
    exportVersion: 1,
    generatedAt,
    account: {
      id: account.id,
      username: account.username,
      email: account.email,
      avatar: account.avatar,
      role: account.role,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
      lastLoginAt: account.last_login_at,
      streak: {
        freezeCount: account.streak_freeze_count,
        highestRecorded: account.streak_freeze_highest,
      },
    },
    privacy: privacyPreferencePayload(preference),
    progress: progressResult.results,
    favorites: favoritesResult.results,
    usageAnalytics: analyticsResult.results,
    verifiedScores: verifiedScoresResult.results,
    suggestions: suggestionsResult.results,
    excludedForSecurity: [
      "password hashes and salts",
      "session tokens and token hashes",
      "verified challenge tokens and expected-answer hashes",
      "rate-limit and abuse-prevention identifiers",
    ],
  }, 200, {
    "content-disposition":
      `attachment; filename="jakh-account-export-${generatedAt.slice(0, 10)}.json"`,
    "x-robots-tag": "noindex, nofollow",
  });
}

export async function deleteAccount(
  request: Request,
  env: Env,
): Promise<Response> {
  const session = await requireUser(request, env);
  await enforceRateLimit(
    env,
    await privacyRateKey(request, env, session, "delete-account"),
    5,
    15 * 60,
  );
  const body = await parseJson<{
    username?: unknown;
    currentPassword?: unknown;
    confirmPermanentDeletion?: unknown;
  }>(request, 4_096);

  if (
    body.confirmPermanentDeletion !== true
    || body.username !== session.username
  ) {
    throw new ApiError(
      400,
      "Enter your exact username and confirm permanent deletion",
      undefined,
      "ACCOUNT_DELETE_CONFIRMATION_REQUIRED",
    );
  }
  const currentPassword = validatePassword(body.currentPassword, "Current password");
  const account = await env.DB.prepare(
    `SELECT password_hash, password_salt, password_iterations
       FROM users
      WHERE id = ?`,
  ).bind(session.id).first<{
    password_hash: string;
    password_salt: string;
    password_iterations: number;
  }>();
  if (
    !account
    || !await verifyPasswordInHasher(
      env,
      currentPassword,
      account.password_hash,
      account.password_salt,
      account.password_iterations,
    )
  ) {
    throw new ApiError(
      401,
      "Current password is incorrect",
      undefined,
      "CURRENT_PASSWORD_INCORRECT",
    );
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM analytics_daily WHERE user_id = ?").bind(session.id),
    env.DB.prepare("DELETE FROM privacy_preferences WHERE user_id = ?").bind(session.id),
    env.DB.prepare("DELETE FROM verified_score_sessions WHERE user_id = ?").bind(session.id),
    env.DB.prepare("DELETE FROM suggestions WHERE user_id = ?").bind(session.id),
    env.DB.prepare("DELETE FROM favorites WHERE user_id = ?").bind(session.id),
    env.DB.prepare("DELETE FROM progress WHERE user_id = ?").bind(session.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(session.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(session.id),
  ]);

  return responseWithClearedSessionCookies(json({
    success: true,
    message: "Account and account-linked data permanently deleted",
    deletedAt: now(),
  }));
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1_000).toISOString();
}

function monthsAgoIso(months: number): string {
  const date = new Date();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const daysInTargetMonth = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  date.setUTCDate(Math.min(day, daysInTargetMonth));
  return date.toISOString();
}

export async function cleanupPrivacyRetentionState(env: Env): Promise<void> {
  const analyticsCutoff = monthsAgoIso(ACCOUNT_ANALYTICS_RETENTION_MONTHS).slice(0, 10);
  const suggestionIpCutoff = daysAgoIso(SUGGESTION_IP_RETENTION_DAYS);
  const suggestionCutoff = monthsAgoIso(SUGGESTION_RETENTION_MONTHS);
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM analytics_daily
        WHERE rowid IN (
          SELECT rowid FROM analytics_daily
           WHERE activity_date < ?
           LIMIT 500
        )`,
    ).bind(analyticsCutoff),
    env.DB.prepare(
      `UPDATE suggestions
          SET ip_hash = NULL
        WHERE id IN (
          SELECT id FROM suggestions
           WHERE ip_hash IS NOT NULL AND created_at < ?
           LIMIT 500
        )`,
    ).bind(suggestionIpCutoff),
    env.DB.prepare(
      `DELETE FROM suggestions
        WHERE id IN (
          SELECT id FROM suggestions
           WHERE created_at < ?
           LIMIT 500
        )`,
    ).bind(suggestionCutoff),
  ]);
}
