# Kiniela

Backend for a private World Cup quiniela with friends. The app manages users, invite-only signup, World Cup fixtures, player bets, scoring rules, boosters, and the leaderboard.

The frontend is not built yet. This README documents the current API contract and the backend journey so a frontend can be built against it.

## What This Backend Does

- Runs a Fastify API from `apps/api`.
- Stores data in SQLite through `better-sqlite3` and Drizzle table definitions.
- Syncs 2026 World Cup teams and fixtures from API-Football.
- Uses invite codes so only invited users can create accounts.
- Uses cookie-based sessions, not bearer tokens in frontend storage.
- Locks bets at match kickoff time.
- Scores finished matches and updates the leaderboard.
- Exposes shared TypeScript DTOs from `packages/shared`.

## Project Layout

- `apps/api` - Fastify API, auth, SQLite schema, migrations, scoring, provider sync.
- `apps/frontend` - placeholder for the future frontend.
- `packages/shared` - TypeScript types that describe API DTOs for the frontend.

## Local Setup

```sh
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm --filter @kiniela/api admin:create
pnpm dev:api
```

Fill `.env` before creating the admin user. The admin script reads `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD`, hashes the password, and creates or updates that admin in the SQLite database.

By default the API runs on:

```txt
http://localhost:3001
```

## Environment

| Name | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | No | `development`, `test`, or `production`. Production makes session cookies `Secure`. |
| `PORT` | No | API port. Defaults to `3001`. |
| `HOST` | No | Bind host. Defaults to `0.0.0.0`. |
| `DATABASE_URL` | No | SQLite location. Defaults to `file:./data/kiniela.sqlite`. |
| `API_FOOTBALL_KEY` | Needed for sync | API-Football key for fixture/team sync. |
| `AUTH_SECRET` | Yes | Required by env validation. Keep it random and private. |
| `CORS_ORIGIN` | No | Comma-separated allowed frontend origins. Defaults to `http://localhost:3000`. |
| `SYNC_ENABLED` | No | When `true`, syncs fixtures on server start and every 6 hours. |
| `ADMIN_EMAIL` | Admin script only | Initial admin email. |
| `ADMIN_NAME` | Admin script only | Initial admin display name. |
| `ADMIN_PASSWORD` | Admin script only | Initial admin password. Minimum 12 characters. |

For Railway with SQLite, use a persistent volume and set `DATABASE_URL` to that mounted path, for example:

```sh
DATABASE_URL=file:/data/kiniela.sqlite
```

## Scripts

```sh
pnpm dev:api       # run the API in watch mode
pnpm db:migrate    # apply SQLite migrations
pnpm build         # compile all packages
pnpm start         # run the compiled API
pnpm typecheck     # TypeScript checks
pnpm test          # test suite
```

Admin user creation:

```sh
pnpm --filter @kiniela/api admin:create
```

## Game Journey

1. **Owner configures the backend**

   The owner creates `.env`, runs migrations, and creates the first admin user. The database starts with default scoring settings.

2. **Admin syncs World Cup data**

   An admin calls `POST /admin/sync/fixtures`, or `SYNC_ENABLED=true` runs sync automatically. The backend fetches teams and fixtures from API-Football, normalizes them into `teams` and `matches`, and keeps raw provider JSON only in the database.

3. **Admin invites friends**

   An admin calls `POST /admin/invites`. The API returns the invite code once. The database stores only a SHA-256 hash of the invite code, not the plain code.

4. **Friend signs up**

   The frontend sends email, name, password, and invite code to `POST /auth/signup`. The backend validates the invite, hashes the password with Argon2id, creates the user, increments invite usage, creates a session, and sets an HTTP-only session cookie.

5. **Frontend restores the session**

   On app load, the frontend calls `GET /auth/me` with credentials enabled. If it returns `200`, the user is logged in. If it returns `401`, show login/signup screens.

6. **Player sees matches and current bets**

   The frontend loads `GET /matches`, `GET /bets/me`, `GET /scoring-settings`, and `GET /leaderboard`. Merge bets by `matchId` on the client so each match card can show the user's saved prediction.

7. **Player places or edits bets**

   The frontend calls `PUT /bets/:matchId` before kickoff. The player sends predicted home/away goals, optional knockout advancer, and optional booster use. The backend derives `predictedOutcome` from the goals and upserts the bet.

8. **Bets lock at kickoff**

   The backend rejects bet changes once `match.kickoffAt <= Date.now()` with `409 { "error": "Bet is locked" }`. The frontend should also disable forms at kickoff for a better UX, but the backend is the source of truth.

9. **Finished matches are scored**

   After fixture sync updates a match to a finished provider status (`FT`, `AET`, or `PEN`), the backend recalculates scores for finished matches. Admin scoring changes also trigger recalculation.

10. **Leaderboard updates**

   `GET /leaderboard` ranks players by total points, then exact scores, then correct outcomes, then name.

## Auth Model

Auth is cookie-based.

- Session cookie name: `kiniela_session`.
- The cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` only when `NODE_ENV=production`.
- The frontend should not store access tokens in `localStorage` or `sessionStorage`.
- Requests from the frontend must include credentials.
- `CORS_ORIGIN` must match the frontend origin exactly.

Example frontend fetch helper:

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed with ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
```

## API Conventions

- JSON request bodies use `Content-Type: application/json`.
- Successful responses are JSON unless the route returns `204`.
- Error responses use this shape:

```json
{
  "error": "Human-readable message"
}
```

Common status codes:

- `400` - invalid request body, invalid invite, invalid provider config.
- `401` - not logged in.
- `403` - logged in but not admin.
- `404` - requested match was not found.
- `409` - duplicate signup email, locked bet, or booster limit reached.
- `500` - unexpected server error.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Health check. |
| `POST` | `/auth/signup` | Public invite | Create user from invite and start a session. |
| `POST` | `/auth/login` | Public | Login and start a session. |
| `POST` | `/auth/logout` | Any | Revoke current session and clear cookie. |
| `GET` | `/auth/me` | User | Return current logged-in user. |
| `GET` | `/matches` | User | Return all matches sorted by kickoff. |
| `GET` | `/matches/:id` | User | Return one match. |
| `PUT` | `/bets/:matchId` | User | Create or update the current user's bet for a match. |
| `GET` | `/bets/me` | User | Return all bets for the current user. |
| `GET` | `/leaderboard` | User | Return ranked player leaderboard. |
| `GET` | `/scoring-settings` | User | Return current scoring settings. |
| `PUT` | `/admin/scoring-settings` | Admin | Update scoring settings and recalculate scores. |
| `POST` | `/admin/invites` | Admin | Create invite code. |
| `GET` | `/admin/users` | Admin | List users. |
| `POST` | `/admin/sync/fixtures` | Admin | Sync teams and fixtures from API-Football. |

## Auth Endpoints

### `POST /auth/signup`

Request:

```json
{
  "email": "friend@example.com",
  "name": "Friend",
  "password": "friend-password-123",
  "inviteCode": "invite-code-from-admin"
}
```

Rules:

- `email` must be valid and is stored lowercase.
- `name` must be 1 to 120 characters.
- `password` must be 12 to 256 characters.
- `inviteCode` must be 12 to 128 characters.
- Invite must exist, not be expired, and not exceed `maxUses`.

Response:

```json
{
  "user": {
    "id": "user-id",
    "email": "friend@example.com",
    "name": "Friend",
    "role": "player"
  }
}
```

### `POST /auth/login`

Request:

```json
{
  "email": "friend@example.com",
  "password": "friend-password-123"
}
```

Response is the same `{ "user": ... }` shape and sets the session cookie.

### `POST /auth/logout`

Revokes the current session if one exists, clears the cookie, and returns `204`.

### `GET /auth/me`

Response:

```json
{
  "user": {
    "id": "user-id",
    "email": "friend@example.com",
    "name": "Friend",
    "role": "player"
  }
}
```

## Matches

### `GET /matches`

Returns:

```json
{
  "matches": [
    {
      "id": 100,
      "round": "Group Stage - 1",
      "stage": "group",
      "kickoffAt": "2026-06-11T00:00:00Z",
      "statusShort": "NS",
      "statusLong": "Not Started",
      "homeTeam": { "id": 10, "name": "Argentina", "country": null, "logoUrl": null },
      "awayTeam": { "id": 20, "name": "Canada", "country": null, "logoUrl": null },
      "homeGoals": null,
      "awayGoals": null,
      "homePenaltyGoals": null,
      "awayPenaltyGoals": null,
      "winnerTeamId": null
    }
  ]
}
```

Frontend notes:

- Show `kickoffAt` in the user's local time.
- Treat `homeTeam` or `awayTeam` as nullable because provider data can be incomplete.
- `stage` is `"group"`, `"knockout"`, or `"unknown"`.
- `statusShort` values come from the provider. Finished matches are currently scored when status is `FT`, `AET`, or `PEN`.
- Bets lock based on `kickoffAt`, not on provider status.

### `GET /matches/:id`

Returns the same match shape as `GET /matches`, wrapped as `{ "match": ... }`. Returns `404` when the match id does not exist.

## Bets

### `GET /bets/me`

Returns the current user's saved bets:

```json
{
  "bets": [
    {
      "id": "bet-id",
      "userId": "user-id",
      "matchId": 100,
      "predictedHomeGoals": 2,
      "predictedAwayGoals": 1,
      "predictedOutcome": "HOME",
      "predictedAdvancerTeamId": null,
      "boosterUsed": false,
      "createdAt": "2026-05-01T12:00:00.000Z",
      "updatedAt": "2026-05-01T12:00:00.000Z"
    }
  ]
}
```

### `PUT /bets/:matchId`

Request:

```json
{
  "predictedHomeGoals": 2,
  "predictedAwayGoals": 1,
  "predictedAdvancerTeamId": null,
  "boosterUsed": false
}
```

Rules:

- Goal predictions must be integers from `0` to `30`.
- `predictedOutcome` is calculated by the backend from the goal predictions.
- `predictedAdvancerTeamId` can be omitted or `null`.
- For knockout matches, `predictedAdvancerTeamId` must be one of the match teams if provided.
- If boosters are disabled, `boosterUsed` is ignored and stored as `false`.
- If boosters are enabled, the backend enforces `boostersPerUser`.
- A user has one bet per match. Calling this route again before kickoff updates the existing bet.

Response:

```json
{
  "bet": {
    "id": "bet-id",
    "userId": "user-id",
    "matchId": 100,
    "predictedHomeGoals": 2,
    "predictedAwayGoals": 1,
    "predictedOutcome": "HOME",
    "predictedAdvancerTeamId": null,
    "boosterUsed": false,
    "createdAt": "2026-05-01T12:00:00.000Z",
    "updatedAt": "2026-05-01T12:00:00.000Z"
  }
}
```

Frontend betting UI should:

- Disable editing when `new Date(match.kickoffAt).getTime() <= Date.now()`.
- Still handle a `409` from the backend because the backend is authoritative.
- Show an advancer picker only when `match.stage === "knockout"` and both teams are known.
- Show booster controls only when `scoringSettings.boostersEnabled` is true.
- Track booster usage from `/bets/me` so the user understands how many are left.

## Scoring And Winning

Scoring happens after a match is finished and has final goals. Finished provider statuses are `FT`, `AET`, and `PEN`.

Default scoring settings from the initial migration:

| Rule | Default points |
| --- | ---: |
| Correct outcome | 4 |
| Exact score | 4 |
| Correct goal difference | 2 |
| Exact home goals | 1 |
| Exact away goals | 1 |
| Exact total goals | 1 |
| Knockout advancer | 2 |
| Group-stage max | 10 |
| Knockout max | 12 |
| Boosters enabled | false |
| Boosters per user | 3 |
| Booster multiplier | 2 |

How points are calculated:

- Outcome is `HOME`, `DRAW`, or `AWAY`.
- Exact score can earn outcome, exact score, and goal-difference points.
- Partial points can still be awarded even when the outcome is wrong, for example exact away goals.
- Knockout matches can award an advancer bonus when `winnerTeamId` matches `predictedAdvancerTeamId`.
- The subtotal is capped by stage (`groupStageMaxPoints` or `knockoutMaxPoints`).
- If boosters are enabled and the bet used a booster, positive capped scores are multiplied.

Current API limitation: per-match score breakdowns are calculated and stored internally, but there is no endpoint yet that returns each user's score breakdown for each match. The frontend can show aggregate leaderboard data today. If the UI should explain "why did I get these points?" per match, add a read endpoint for the `scores.breakdown_json` data.

### `GET /scoring-settings`

Use this instead of hard-coding scoring copy in the frontend.

```json
{
  "scoringSettings": {
    "correctOutcomePoints": 4,
    "exactScorePoints": 4,
    "correctGoalDifferencePoints": 2,
    "exactHomeGoalsPoints": 1,
    "exactAwayGoalsPoints": 1,
    "exactTotalGoalsPoints": 1,
    "knockoutAdvancerPoints": 2,
    "groupStageMaxPoints": 10,
    "knockoutMaxPoints": 12,
    "boostersEnabled": false,
    "boostersPerUser": 3,
    "boosterMultiplier": 2,
    "updatedAt": "2026-05-01T12:00:00.000Z"
  }
}
```

### `PUT /admin/scoring-settings`

Admins can send any subset of scoring settings:

```json
{
  "exactScorePoints": 8,
  "boostersEnabled": true
}
```

The backend updates settings and recalculates finished-match scores.

## Leaderboard

### `GET /leaderboard`

Returns:

```json
{
  "leaderboard": [
    {
      "user": {
        "id": "user-id",
        "email": "friend@example.com",
        "name": "Friend",
        "role": "player"
      },
      "totalPoints": 20,
      "exactScores": 2,
      "correctOutcomes": 4,
      "playedMatches": 5
    }
  ]
}
```

Sorting:

1. Highest `totalPoints`.
2. Highest `exactScores`.
3. Highest `correctOutcomes`.
4. Alphabetical `user.name`.

Frontend note: the current API includes player email in `leaderboard[].user.email` because it reuses the public user DTO. If emails should not be shown in the UI, hide them client-side or adjust the backend DTO before launch.

## Admin Endpoints

### `POST /admin/invites`

Request:

```json
{
  "role": "player",
  "maxUses": 1,
  "expiresAt": null
}
```

Rules:

- `role` is `"player"` or `"admin"`, defaulting to `"player"`.
- `maxUses` is `1` to `100`, defaulting to `1`.
- `expiresAt` is optional, nullable, and must be an ISO datetime when provided.

Response:

```json
{
  "invite": {
    "id": "invite-id",
    "code": "plain-code-shown-once",
    "role": "player",
    "maxUses": 1,
    "expiresAt": null
  }
}
```

Store or send the returned `code` immediately. The backend stores only its hash.

### `GET /admin/users`

Returns:

```json
{
  "users": [
    {
      "id": "user-id",
      "email": "friend@example.com",
      "name": "Friend",
      "role": "player"
    }
  ]
}
```

### `POST /admin/sync/fixtures`

Requires `API_FOOTBALL_KEY`.

Response:

```json
{
  "fixtures": 104,
  "teams": 48
}
```

The sync flow:

- Fetch teams for league `1`, season `2026`.
- Fetch fixtures for league `1`, season `2026`.
- Upsert teams and matches.
- Infer match stage from provider round text.
- Recalculate finished scores.
- Record sync success or error in `sync_runs`.

## Frontend Build Notes

Use `packages/shared` as the source of truth for response DTOs:

```ts
import type {
  BetDto,
  LeaderboardEntryDto,
  MatchDto,
  PublicUser,
  ScoringSettingsDto
} from "@kiniela/shared";
```

Suggested app boot flow:

1. Call `GET /auth/me`.
2. If `401`, show login/signup.
3. If logged in, load `GET /matches`, `GET /bets/me`, `GET /scoring-settings`, and `GET /leaderboard`.
4. Merge matches and bets by `match.id === bet.matchId`.
5. For admins, show invite creation, user list, scoring settings, and sync controls.

Suggested main screens:

- Login.
- Signup with invite code.
- Match list with status, kickoff, teams, current prediction, and lock state.
- Bet editor modal or inline form.
- Leaderboard.
- Rules/scoring view sourced from `/scoring-settings`.
- Admin panel for invites, fixture sync, users, and scoring settings.

Important frontend details:

- Always call the API with `credentials: "include"`.
- Do not store session secrets in browser storage.
- Use ISO date strings from the API and format them in the user's local timezone.
- Treat nullable teams, scores, penalties, and winner fields as normal.
- Keep client-side lock/validation logic for UX, but handle backend errors as final truth.
- For local development, set the frontend origin in `CORS_ORIGIN`.
- For production cross-site frontend/API deployments, make sure HTTPS is used because production cookies are `Secure`.

## Security Defaults

- Real `.env` files are ignored.
- SQLite data files are ignored.
- Logs redact cookies, auth headers, API keys, passwords, and tokens.
- Passwords are hashed with Argon2id.
- Session and invite tokens are stored hashed in the database.
- Dependencies are pinned exactly.
- `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`.

## Verification

Before pushing or deploying:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm audit --audit-level moderate
```
