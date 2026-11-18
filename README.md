# liquid-chofer-be

API del panel de Liquid Chofer: sesión con Firebase, ajustes, jornadas, borrador, papelera y asistente de IA.

## Requisitos

- Node.js `^22.13.0 || >=24.11.0` (declarado en `engines`)
- pnpm
- MySQL 8+

## Configuración

Copiar `.env.example` a `.env` y completar los valores. Los secretos no se versionan.

Variables principales: `NODE_ENV`, `CORS_ORIGIN`, `PORT`, `DB_*`, `FIREBASE_*`, `JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_EXPIRES_IN`, `MAX_AGE`, `CLOUDINARY_*`, `IA_*`, `URL_IA`, `AI_DAILY_LIMIT`.

En producción, `NODE_ENV=production` y `CORS_ORIGIN` son obligatorios (orígenes explícitos separados por coma, sin `*`). Si `NODE_ENV` no está definido, la app se comporta como producción: cookies `Secure` y sin sentencias SQL múltiples.

## Comandos

```bash
pnpm install
pnpm start:dev      # desarrollo
pnpm build && pnpm start:prod
pnpm lint
pnpm test           # tests unitarios
pnpm test:cov       # unitarios con coverage
pnpm test:e2e       # health endpoint (sin BD ni Firebase)
pnpm migration:run  # migraciones en desarrollo
```

## Deploy

1. `pnpm build`
2. `pnpm release` (ejecuta las migraciones desde `dist`)
3. `pnpm start:prod`

Healthcheck: `GET /api/v1/health` → `{ "status": "ok" }`.

## Endpoints

Base `/api/v1`. Módulos: `auth`, `settings`, `journeys`, `journey-draft`, `verify`, `ai` y `health`. Las rutas están centralizadas en `src/core/config/config.endpoints.ts`.
