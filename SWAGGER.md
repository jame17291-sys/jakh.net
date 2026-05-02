# jakh.net API — Swagger Reference

Base URL: `https://jakh.net`  
All HTTP routes are prefixed with `/api`.  
Authentication uses an `HttpOnly` cookie named `auth_token` containing a signed JWT.  
A WebSocket endpoint is available at `wss://jakh.net/ws/battle`.

---

## Auth

### POST /api/auth/register

Register a new user account.

- **Auth required**: No
- **Rate limit**: 10 requests per 15 minutes

**Request body** (`application/json`):
```json
{
  "username": "string (3–20 chars, a-z A-Z 0-9 _)",
  "password": "string (8–128 chars)",
  "email":    "string | optional"
}
```

**Response 201**:
```json
{
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string | null",
    "role": "USER | ADMIN | OWNER"
  }
}
```
Sets `auth_token` cookie (HttpOnly, Secure, SameSite=Strict, 7-day expiry).

**Error responses**: 400 (validation), 500

---

### POST /api/auth/login

Authenticate and start a session. Invalidates any previous session (single-device enforcement).

- **Auth required**: No
- **Rate limit**: 10 requests per 15 minutes

**Request body**:
```json
{
  "username": "string",
  "password": "string"
}
```

**Response 200**:
```json
{
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string | null",
    "role": "USER | ADMIN | OWNER"
  }
}
```
Sets `auth_token` cookie.

**Error responses**: 400 (missing fields), 401 (invalid credentials), 403 (banned account), 500

---

### POST /api/auth/logout

Clear the auth cookie and end the session.

- **Auth required**: No (no token validation performed)

**Request body**: None

**Response 200**:
```json
{ "message": "Logged out successfully" }
```

---

## User

All routes under `/api/user` require authentication via the `auth_token` cookie. Middleware validates the JWT and confirms the `sessionId` matches the current active session in the database.

### GET /api/user/profile

Fetch the authenticated user's profile, progress, and favorites.

- **Auth required**: Yes

**Response 200**:
```json
{
  "id": "uuid",
  "username": "string",
  "email": "string | null",
  "role": "string",
  "avatar": "string | null",
  "stats": {
    "solvedCount": "number",
    "favoritesCount": "number"
  },
  "progress": [ { "id": "uuid", "userId": "uuid", "categoryId": "string", "cardId": "string", "status": "string", "createdAt": "datetime" } ],
  "favorites": [ { "id": "uuid", "userId": "uuid", "categoryId": "string", "cardId": "string", "createdAt": "datetime" } ]
}
```

**Error responses**: 401, 404, 500

---

### POST /api/user/favorite

Add or remove a card from favorites.

- **Auth required**: Yes

**Request body**:
```json
{
  "categoryId": "string",
  "cardId":     "string",
  "action":     "add | remove"
}
```

**Response 200**:
```json
{ "success": true }
```

**Error responses**: 401, 500

---

### POST /api/user/progress

Upsert the solve status for a single card.

- **Auth required**: Yes

**Request body**:
```json
{
  "cardId":     "string",
  "categoryId": "string",
  "status":     "string (e.g. easy, medium, hard, very-advanced, wrong-*)"
}
```

**Response 200**:
```json
{ "success": true }
```

**Error responses**: 400 (missing fields), 401, 500

---

### DELETE /api/user/progress

Remove a single card's progress record.

- **Auth required**: Yes

**Query params**:
- `cardId` (required)
- `categoryId` (required)

**Response 200**:
```json
{ "success": true }
```

**Error responses**: 400, 401, 500

---

### POST /api/user/password

Change the authenticated user's password.

- **Auth required**: Yes

**Request body**:
```json
{
  "currentPassword": "string",
  "newPassword":     "string (8–128 chars)"
}
```

**Response 200**:
```json
{ "success": true, "message": "Password updated successfully" }
```

**Error responses**: 400, 401 (wrong current password), 404, 500

---

### GET /api/user/streak

Calculate and return the user's current daily solve streak, applying streak-freeze items where needed.

- **Auth required**: Yes

**Response 200**:
```json
{
  "streak":      "number",
  "freezeCount": "number"
}
```

**Error responses**: 401, 500

---

### PUT /api/user/avatar

Update the user's avatar (emoji character, max 10 chars).

- **Auth required**: Yes

**Request body**:
```json
{ "avatar": "string (max 10 chars)" }
```

**Response 200**:
```json
{ "success": true, "avatar": "string" }
```

**Error responses**: 400, 401, 500

---

## Team

### GET /api/team/profile/:teamId

Fetch public team profile, member scores, weekly challenge progress, and recent activity.

- **Auth required**: No
- **Path param**: `teamId` (UUID-style hex string)

**Response 200**:
```json
{
  "id": "uuid",
  "name": "string",
  "slug": "string | null",
  "bio":  "string | null",
  "tags": ["string"],
  "captainId": "uuid | null",
  "score": "number",
  "battleWins": "number",
  "battleTotal": "number",
  "createdAt": "datetime",
  "members": [
    { "userId": "uuid", "username": "string", "role": "string", "joinedAt": "datetime", "score": "number", "solved": "number" }
  ],
  "totalSolved": "number",
  "weeklyChallenge": {
    "weekId": "string",
    "title": "string",
    "titleAr": "string",
    "categories": ["string"],
    "questionCount": 30,
    "endsAt": "datetime",
    "progress": [ { "userId": "uuid", "answered": "number", "points": "number" } ],
    "totalAnswered": "number"
  },
  "activity": [ { "type": "member_joined | member_solved", "username": "string", "at": "datetime" } ]
}
```

**Error responses**: 400 (invalid id), 404, 500

---

All routes below require authentication via the `auth_token` cookie.

### GET /api/team/my-teams

List all teams the authenticated user belongs to, with weekly challenge progress.

- **Auth required**: Yes

**Response 200**: Array of team objects:
```json
[{
  "id": "uuid",
  "name": "string",
  "slug": "string | null",
  "bio":  "string | null",
  "tags": ["string"],
  "captainId": "uuid | null",
  "score": "number",
  "battleWins": "number",
  "battleTotal": "number",
  "role": "string",
  "members": ["username"],
  "weeklyProgress": [ { "teamId": "uuid", "userId": "uuid", "weekId": "string", "answered": "number", "points": "number" } ]
}]
```

**Error responses**: 401, 500

---

### POST /api/team/create

Create a new team. The creating user becomes captain.

- **Auth required**: Yes

**Request body**:
```json
{ "name": "string" }
```

**Response 201**:
```json
{ "success": true, "teamId": "uuid", "slug": "string" }
```

**Error responses**: 400, 401, 500

---

### POST /api/team/delete

Delete a team (captain only).

- **Auth required**: Yes

**Request body**:
```json
{ "teamId": "uuid" }
```

**Response 200**:
```json
{ "success": true }
```

**Error responses**: 400, 401, 403, 404, 500

---

### PATCH /api/team/:teamId

Update team bio and/or tags (captain only).

- **Auth required**: Yes
- **Path param**: `teamId`

**Request body**:
```json
{
  "bio":  "string (max 200 chars, optional)",
  "tags": ["string", "up to 5 items, optional"]
}
```

**Response 200**:
```json
{ "success": true }
```

**Error responses**: 400, 401, 403, 404, 500

---

### POST /api/team/score

Increment a team's score. Caller must be a member of the team.

- **Auth required**: Yes

**Request body**:
```json
{ "teamId": "uuid", "points": "number" }
```

**Response 200**:
```json
{ "success": true }
```

**Error responses**: 401, 403, 500

---

### POST /api/team/add-member

Add a user to the team by username. Caller must be a member.

- **Auth required**: Yes

**Request body**:
```json
{ "teamId": "uuid", "username": "string" }
```

**Response 200**:
```json
{ "success": true }
```

**Error responses**: 401, 403, 404 (user not found), 409 (already a member), 500

---

### POST /api/team/leave

Leave a team. The captain must transfer captaincy first.

- **Auth required**: Yes

**Request body**:
```json
{ "teamId": "uuid" }
```

**Response 200**:
```json
{ "success": true }
```

**Error responses**: 400, 401, 404, 500

---

### GET /api/team/challenge/current

Get the current weekly challenge definition plus the authenticated user's and their teams' progress.

- **Auth required**: Yes

**Response 200**:
```json
{
  "challenge": {
    "weekId": "string",
    "title": "string",
    "titleAr": "string",
    "categories": ["string"],
    "questionCount": 30,
    "endsAt": "datetime"
  },
  "teamProgress": [
    { "teamId": "uuid", "userId": "uuid", "username": "string", "answered": "number", "points": "number", "lastActiveAt": "datetime" }
  ],
  "myProgress": { "answered": "number", "points": "number" } | null
}
```

**Error responses**: 401, 500

---

### POST /api/team/challenge/progress

Record one answered question in the current weekly challenge. Updates all teams the user belongs to atomically.

- **Auth required**: Yes

**Request body**:
```json
{
  "weekId": "string",
  "points": "number (optional, default 100, capped 0–500)"
}
```

**Response 200**:
```json
{ "success": true }
```
or
```json
{ "success": false, "reason": "no_team" }
```

**Error responses**: 400, 401, 500

---

### POST /api/team/nudge

Send a nudge notification to a teammate. Limited to once per 24 hours per target.

- **Auth required**: Yes

**Request body**:
```json
{ "teamId": "uuid", "toUserId": "uuid" }
```

**Response 200**:
```json
{ "success": true }
```

**Error responses**: 400, 401, 403, 429 (already nudged recently), 500

---

### GET /api/team/nudge/pending

Retrieve and mark-as-seen all pending nudges for the authenticated user (max 5).

- **Auth required**: Yes

**Response 200**: Array:
```json
[
  { "id": "uuid", "from": "username", "team": "team name", "teamId": "uuid", "at": "datetime" }
]
```

**Error responses**: 401, 500

---

### GET /api/team/leaderboard

Top 20 teams ranked by cumulative score.

- **Auth required**: Yes (falls under the `authenticate` middleware applied to the router)

**Response 200**: Array:
```json
[
  { "rank": 1, "id": "uuid", "name": "string", "slug": "string | null", "score": "number", "battleWins": "number", "memberCount": "number" }
]
```

**Error responses**: 401, 500

---

## Analytics

### POST /api/analytics/time

Record time-on-page. Optionally associates the record with the logged-in user (reads cookie without enforcing auth). Country is resolved asynchronously via ip-api.com after the response is sent.

- **Auth required**: No (optional user context)

**Request body**:
```json
{
  "pageSlug":  "string",
  "timeSpent": "number (seconds, accepted range 5–7200)"
}
```

**Response 200**:
```json
{ "success": true }
```

**Error responses**: 400 (invalid payload), 500

---

## Admin

All `/api/admin` routes require the `auth_token` cookie to belong to a user with role `ADMIN` or `OWNER`. Middleware also validates the `sessionId` against the database.

### GET /api/admin/overview

High-level platform statistics: user counts, analytics event counts, top categories, recent signups.

- **Auth required**: Yes (Admin/Owner)

**Response 200**:
```json
{
  "totalUsers": "number",
  "newUsersToday": "number",
  "newUsersThisWeek": "number",
  "newUsersThisMonth": "number",
  "activeUsers24h": "number",
  "totalEvents": "number",
  "eventsToday": "number",
  "totalSolves": "number",
  "totalFavorites": "number",
  "topCategories": [ { "slug": "string", "totalMinutes": "number", "sessions": "number" } ],
  "recentSignups": [ { "id": "uuid", "username": "string", "email": "string | null", "country": "string | null", "createdAt": "datetime", "role": "string" } ]
}
```

---

### GET /api/admin/users

Paginated, searchable, filterable user list.

- **Auth required**: Yes (Admin/Owner)
- **Query params**:
  - `search` — partial match on username or email
  - `page` — page number (default 1, 20 per page)
  - `filter` — `admins` | `banned`

**Response 200**:
```json
{
  "users": [ { "id": "uuid", "username": "string", "email": "string | null", "role": "string", "isBanned": "boolean", "country": "string | null", "createdAt": "datetime", "lastLoginAt": "datetime | null", "progressCount": "number", "favoritesCount": "number" } ],
  "total": "number",
  "page": "number",
  "pages": "number"
}
```

---

### PATCH /api/admin/users/:id/role

Change a user's role (`USER` or `ADMIN`). OWNER role is immutable. Only OWNER may demote an ADMIN.

- **Auth required**: Yes (Admin/Owner)

**Request body**:
```json
{ "role": "ADMIN | USER" }
```

**Response 200**:
```json
{ "success": true, "role": "string" }
```

**Error responses**: 400, 403, 404, 500

---

### PATCH /api/admin/users/:id/ban

Ban or unban a user. Cannot ban OWNER or self.

- **Auth required**: Yes (Admin/Owner)

**Request body**:
```json
{ "banned": "boolean" }
```

**Response 200**:
```json
{ "success": true, "isBanned": "boolean" }
```

**Error responses**: 400, 403, 404, 500

---

### DELETE /api/admin/users/:id

Permanently delete a user account. Cannot delete OWNER or self.

- **Auth required**: Yes (Admin/Owner)

**Response 200**:
```json
{ "success": true }
```

**Error responses**: 400, 403, 404, 500

---

### GET /api/admin/users/:id/activity

Per-user activity drill-down: solves by category, favorites by category, time spent by category.

- **Auth required**: Yes (Admin/Owner)

**Response 200**:
```json
{
  "user": { "id": "uuid", "username": "string", "email": "string | null", "role": "string", "country": "string | null", "createdAt": "datetime", "lastLoginAt": "datetime | null", "isBanned": "boolean" },
  "solvesByCategory":    [ { "category": "string", "count": "number" } ],
  "favoritesByCategory": [ { "category": "string", "count": "number" } ],
  "timeByCategory":      [ { "category": "string", "minutes": "number", "sessions": "number" } ]
}
```

**Error responses**: 404, 500

---

### GET /api/admin/analytics

Platform-wide analytics: per-category time, country breakdown, 30-day daily event counts, hardest riddles, summary stats.

- **Auth required**: Yes (Admin/Owner)

**Response 200**:
```json
{
  "categoryTime":   [ { "slug": "string", "totalMinutes": "number", "sessions": "number", "percentage": "number" } ],
  "countryStats":   [ { "country": "string", "visits": "number", "percentage": "number" } ],
  "daily":          [ { "date": "YYYY-MM-DD", "count": "number" } ],
  "hardestRiddles": [ { "cardId": "string", "categoryId": "string", "fails": "number" } ],
  "summary": {
    "totalSessions": "number",
    "uniqueVisitors": "number",
    "avgMinutesPerSession": "number",
    "totalHours": "number"
  }
}
```

---

### GET /api/admin/content

List all content categories from `catalog.json` with aggregate solve and favorite counts.

- **Auth required**: Yes (Admin/Owner)

**Response 200**:
```json
{
  "categories": [ { "...catalog fields": "...", "totalSolves": "number", "totalFavorites": "number" } ],
  "site": "object"
}
```

---

### GET /api/admin/content/:slug

Return the raw JSON file for a given category slug.

- **Auth required**: Yes (Admin/Owner)
- **Path param**: `slug` (a-z 0-9 hyphens only)

**Response 200**: Raw category JSON object.

**Error responses**: 400 (invalid slug), 404, 500

---

### PATCH /api/admin/content/:slug/cards/:id

Edit fields of a specific card within a category file. The card `id` in the body is ignored.

- **Auth required**: Yes (Admin/Owner)

**Request body**: Any card fields to overwrite (arbitrary JSON object).

**Response 200**:
```json
{ "success": true, "card": { "...updated card": "..." } }
```

**Error responses**: 400, 404, 500

---

### POST /api/admin/content/:slug/cards

Add a new card to a category. Auto-generates an ID as `{slug}-{timestamp}` and updates `catalog.json` count.

- **Auth required**: Yes (Admin/Owner)

**Request body**: Card fields (arbitrary JSON object).

**Response 200**:
```json
{ "success": true, "card": { "...new card": "..." } }
```

**Error responses**: 400, 404, 500

---

### DELETE /api/admin/content/:slug/cards/:id

Remove a card from a category file.

- **Auth required**: Yes (Admin/Owner)

**Response 200**:
```json
{ "success": true }
```

**Error responses**: 400, 404, 500

---

### POST /api/admin/settings/password

Change the admin's own account password.

- **Auth required**: Yes (Admin/Owner)

**Request body**:
```json
{ "currentPassword": "string", "newPassword": "string (min 8 chars)" }
```

**Response 200**:
```json
{ "success": true }
```

**Error responses**: 400, 401, 404, 500

---

### POST /api/admin/settings/revoke-sessions

Invalidate all active sessions except the caller's own and OWNER sessions.

- **Auth required**: Yes (Admin/Owner)

**Response 200**:
```json
{ "success": true, "message": "All other sessions revoked" }
```

---

### GET /api/admin/suggestions

List all user suggestions, optionally filtered by status.

- **Auth required**: Yes (Admin/Owner)
- **Query param**: `status` — `new` | `reviewed` | `implemented` | `rejected` (optional)

**Response 200**:
```json
{ "suggestions": [ { "id": "uuid", "text": "string", "email": "string | null", "ipHash": "string | null", "status": "string", "createdAt": "datetime" } ] }
```

---

### PATCH /api/admin/suggestions/:id/status

Update the review status of a suggestion.

- **Auth required**: Yes (Admin/Owner)

**Request body**:
```json
{ "status": "new | reviewed | implemented | rejected" }
```

**Response 200**:
```json
{ "success": true, "status": "string" }
```

**Error responses**: 400, 500

---

### DELETE /api/admin/suggestions/:id

Permanently delete a suggestion.

- **Auth required**: Yes (Admin/Owner)

**Response 200**:
```json
{ "success": true }
```

---

### GET /api/admin/export/users

Export all users as a CSV file download (no pagination — full table scan).

- **Auth required**: Yes (Admin/Owner)

**Response**: `text/csv` attachment `jakh-users.csv`  
Columns: `ID, Username, Email, Role, Banned, Country, Joined, LastLogin, Solved, Favorites`

---

## Suggestions

### POST /api/suggestions

Submit a user suggestion. Anonymous or logged-in.

- **Auth required**: No
- **Rate limit**: 3 requests per 24 hours per IP

**Request body**:
```json
{
  "text":  "string (5–500 chars)",
  "email": "string | optional"
}
```

**Response 200**:
```json
{ "success": true }
```

**Error responses**: 400 (validation), 429 (rate limit), 500

---

## TTS (Text-to-Speech)

### GET /api/tts

Proxy a text-to-speech audio request to Google Translate TTS. Response is streamed audio.

- **Auth required**: No
- **Rate limit**: 120 requests per hour per IP

**Query params**:
- `text` — string to synthesize (max 500 chars, required)
- `lang` — `en` (default) | `ar`

**Response 200**: `audio/mpeg` binary, `Cache-Control: public, max-age=86400`

**Error responses**: 400 (missing/too-long text), 502 (upstream TTS failed), 500

---

## Leaderboard

### GET /api/leaderboard

Top 20 users ranked by weighted solve score (easy=1, medium=2, hard=3, very-advanced=5 points).

- **Auth required**: No

**Response 200**:
```json
{
  "leaderboard": [
    { "rank": 1, "username": "string", "score": "number" }
  ]
}
```

**Error responses**: 500

---

## Battle (Real-time Multiplayer)

### POST /api/battle/create

Create a new battle room. Returns a room code and a host secret to use when joining.

- **Auth required**: No

**Request body**:
```json
{
  "category":      "string (required)",
  "difficulty":    "string (optional, default: all)",
  "questionCount": "number (optional, default: 10, clamped 5–30)"
}
```

**Response 200**:
```json
{ "code": "string", "hostId": "string" }
```

**Error responses**: 400 (invalid category, no questions available)

---

### WebSocket: ws://jakh.net/ws/battle

Real-time battle gameplay. All messages are JSON.

**Client → Server messages**:

| `type` | Fields | Description |
|--------|--------|-------------|
| `join-room` | `code`, `name`, `hostId?` | Join a lobby by room code |
| `start-game` | `hostId?` | Host starts the game (lobby must have ≥1 player) |
| `submit-answer` | `answerIndex` (0–3) | Submit answer during question phase |

**Server → Client messages**:

| `type` | Payload | Description |
|--------|---------|-------------|
| `joined` | `{ playerId, isHost }` | Confirm successful room join |
| `room-update` | `{ roomState }` | Lobby state changed (player join/leave) |
| `question` | `{ roomState, question, timeMs }` | New question broadcast |
| `answer-count` | `{ answeredCount, totalPlayers }` | Intermediate answer tally |
| `reveal` | `{ roomState, correctIndex, correctAnswer }` | Answer reveal with updated scores |
| `game-end` | `{ roomState }` | Final leaderboard |
| `error` | `{ message }` | Error (room not found, already started, full) |

**Room lifecycle**: Lobby expires in 30 minutes if not started. Finished room data is cleaned up after 5 minutes.

---

## Health

### GET /api/health

Service liveness check.

- **Auth required**: No

**Response 200**:
```json
{ "status": "ok", "message": "JAKH Riddles API is running" }
```

---

---

## Audit Findings

### N+1 Query Issues

**1. `api/src/routes/team.ts` — `uniqueSlug` function (lines 53–59)**
Each iteration of the while-loop issues a separate `prisma.team.findUnique` query until a unique slug is found. In a high-collision scenario (many teams with the same base name) this can fire arbitrarily many sequential DB round-trips. A single `findMany` + in-process collision check, or a `findFirst` with a LIKE query, would eliminate the loop queries.

**2. `api/src/routes/admin.ts` — `GET /admin/analytics`, daily counts loop (lines 250–259)**
`Array.from({ length: 30 }, ...)` followed by `Promise.all(...)` issues **30 separate** `prisma.pageAnalytics.count` queries — one per day — in parallel. While Promise.all avoids sequential latency, it still creates 30 individual DB round-trips. A single `groupBy` aggregation on `createdAt` date-truncated to day would be one query.

**3. `api/src/routes/team.ts` — `GET /team/challenge/current` (lines 359–365)**
After fetching `allProgress` records, a second query `prisma.user.findMany` is issued to resolve usernames for the progress records. This is a manual two-query join that could be avoided by using `include: { user: { select: { id, username } } }` on the `teamChallengeProgress` query.

**4. `api/src/routes/admin.ts` — `GET /admin/export/users` (lines 471–491)**
Fetches the entire `user` table with no `take` or pagination limit (`prisma.user.findMany` with no constraint). On large datasets this loads every user row into Node.js heap memory before streaming the CSV, which is an unbounded memory N-rows problem.

**5. `api/src/routes/admin.ts` — `GET /admin/analytics`, unique visitor count (lines 262–265)**
```ts
const uniqueVisitors = await prisma.pageAnalytics.findMany({
  where: { userId: { not: null } },
  select: { userId: true },
  distinct: ['userId'],
});
```
This loads all distinct userId rows into Node.js and then calls `.length` in-process. Should be replaced with `prisma.pageAnalytics.groupBy` + `_count` or a raw `COUNT(DISTINCT userId)` to avoid materialising rows.

---

### Missing Error Handling

**1. `api/src/routes/user.ts` — JWT fallback secret (line 7)**
```ts
const JWT_SECRET = process.env.JWT_SECRET || 'emergency-fallback-secret-change-me';
```
Unlike `auth.ts` (which calls `process.exit(1)` when `JWT_SECRET` is absent), `user.ts` silently falls back to a hardcoded string. If the environment variable is unset, tokens will be signed and verified against a known-public string. Same issue exists in `analytics.ts` (line 6).

**2. `api/src/routes/team.ts` — JWT fallback secret (line 6)**
```ts
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
```
Same as above — the team router's local `authenticate` middleware uses the literal string `'secret'` as a fallback, which is weaker than even the user router's fallback. This middleware does not perform session-ID validation against the database (unlike the user and admin routers), meaning a revoked token can still pass.

**3. `api/src/routes/team.ts` — `POST /team/score` has no points validation (lines 287–300)**
`points` is taken directly from `req.body` and passed to `prisma.team.update({ data: { score: { increment: points } } })`. There is no check that `points` is a positive integer, or that it is within any sane bounds. A member can pass a negative number to decrement the score, or a float.

**4. `api/src/routes/admin.ts` — `GET /admin/users/:id/activity` does not check admin privilege on `req` (lines 189–220)**
The function signature is `async (_req: Request, res: Response)` — the request parameter is named `_req` indicating it is intentionally unused, yet `_req.params.id` is read on line 192. The `requireAdmin` middleware is applied at the router level so auth is enforced, but the naming is misleading and a future refactor could accidentally drop auth on this handler.

**5. `api/src/routes/admin.ts` — `PATCH /admin/suggestions/:id/status` does not handle `Prisma.P2025` (record not found) (lines 445–458)**
If the suggestion ID does not exist, Prisma throws `PrismaClientKnownRequestError` with code `P2025`. The catch block returns a generic 500 rather than a 404. Same issue on `DELETE /admin/suggestions/:id` (lines 460–467) and `DELETE /admin/users/:id` (lines 175–186) — a missing record produces a 500 instead of a 404.

**6. `api/src/index.ts` — No global error-handling middleware (line 59)**
Express requires a 4-argument `(err, req, res, next)` middleware to catch errors thrown from route handlers. None is registered. Any uncaught synchronous throw inside a route will cause an unhandled exception. Async handlers are individually wrapped in try/catch, but any missed handler (e.g., future additions) will silently crash the process.

**7. `api/src/index.ts` — No 404 catch-all route**
There is no fallback route for unmatched paths. Requests to undefined endpoints receive Express's default HTML 404 page rather than a consistent JSON error response.

**8. `api/src/routes/battle.ts` — `POST /api/battle/create` wraps `createRoom` in try/catch but `createRoom` can throw synchronously for reasons other than the two documented ones (lines 292–304)**
`generateCode` uses recursion with no depth limit. If the rooms map is full of codes matching the generated prefix pattern, the recursion is unbounded (stack overflow). This is a theoretical edge case but there is no guard.

**9. `api/src/routes/analytics.ts` — `setImmediate` async callback has no unhandled-rejection guard beyond its inner try/catch (lines 33–47)**
The inner try/catch is present, but `setImmediate` fires after the response has been sent. If the outer `prisma.pageAnalytics.update` call inside `setImmediate` throws outside the try/catch scope (e.g., connection loss mid-update), Node will emit an unhandled promise rejection. The code is actually structured safely here (the entire body is wrapped), but the pattern depends on future maintainers keeping the try/catch intact.

**10. `api/src/routes/team.ts` — `POST /team/add-member` does not validate `teamId` or `username` as non-empty strings before querying (lines 303–323)**
If `teamId` or `username` are missing from the body, Prisma will receive `undefined` and throw a validation error that propagates to the catch block as a 500. Other similar routes explicitly check for these fields (e.g., `/leave` checks `!teamId`), but `add-member` and `score` do not.
