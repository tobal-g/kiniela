# Kiniela

Backend for a private World Cup quiniela with friends.

## Setup

```sh
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm --filter @kiniela/api admin:create
```

Fill `.env` before creating the admin user.

## Run

```sh
pnpm dev:api
```

Production:

```sh
pnpm build
pnpm start
```

## Checks

```sh
pnpm typecheck
pnpm test
```

## Required Env

- `DATABASE_URL`
- `AUTH_SECRET`
- `API_FOOTBALL_KEY`
- `CORS_ORIGIN`

For Railway with SQLite, use a persistent volume and set `DATABASE_URL` to that mounted path.
