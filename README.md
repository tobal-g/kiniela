# Kiniela

Backend monorepo for a private World Cup quiniela.

## Layout

- `apps/api` - Fastify API, SQLite, auth, scoring, API-Football sync.
- `apps/frontend` - placeholder for the future frontend.
- `packages/shared` - DTOs shared with the frontend.

## Security defaults

- Uses `pnpm@10.32.1`.
- `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`.
- Dependencies are pinned exactly.
- Real `.env` files and SQLite data files are ignored.
- Logs redact cookies, auth headers, API keys, passwords, and tokens.

## Local setup

```sh
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm --filter @kiniela/api admin:create
pnpm dev:api
```

## Railway

Use a persistent volume for SQLite and set `DATABASE_URL` to that path, for example:

```sh
DATABASE_URL=file:/data/kiniela.sqlite
```

Build with `pnpm install --frozen-lockfile && pnpm build`.
Start with `pnpm --filter @kiniela/api start`.
