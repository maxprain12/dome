# Qué desplegar en Coolify

El código ya puede vivir en `main`. Estos servicios no se crean solos. Hazlos en el proyecto **Produccion**, detrás del túnel `cloudflared` que ya tienes.

## Ahora (hace falta para que CI, descargas y el provider nuevo funcionen)

1. **Migraciones de Postgres** del provider, antes o justo al desplegar el código nuevo:
   - `20260924110000_remote_expires_idx.sql`
   - `20260924110100_scheduler_leases.sql`
   - `20260924110200_push_tokens.sql`
   - `pnpm run migrate` contra la base de producción. Sin ellas fallan leases, push y la limpieza remota.

2. **Woodpecker** (`dome/infra/woodpecker/compose.yml`), dominio `ci.dowi.es` → puerto 8000.
   - OAuth app de GitHub: callback `https://ci.dowi.es/authorize`.
   - Variables: `WP_GITHUB_CLIENT`, `WP_GITHUB_SECRET`, `WP_AGENT_SECRET` (`openssl rand -hex 32`), `WP_DATABASE_URL` (base `woodpecker` en el Postgres que ya tienes).
   - Activa los repos `dome`, `dome-provider`, `landing-page-dome`, `dome-companion`.
   - Secretos por repo: `coolify_token`, `coolify_url`. En provider y companion, también `dome_deploy_key` (deploy key de solo lectura de dome).
   - Cuando el primer pipeline verde publique commit statuses, márcalos como checks obligatorios en GitHub y **apaga Auto Deploy** de `dome-provider` y `landing-page-dome`. Hasta ese momento, un push a `main` sigue desplegando solo.

3. **Buckets de releases**
   - Staging, privado, en SeaweedFS: `dome-releases-staging`.
   - Público: bucket `dome-releases` en Cloudflare R2, dominio `dl.dowi.es`.
   - Caché: `releases/**` un año e inmutable; `feed/**` e `index.json` 60 segundos.
   - Clave de las máquinas de build: solo escritura en staging. Clave de publicación: lectura de staging y escritura en el bucket público.
   - Plantilla de variables: `.env.release.example`.

4. **Provider en producción** (la app que ya existe, uuid `x12svn0jmz00bcz06bucp0e8`).
   - `REDIS_URL` obligatorio, apuntando al Redis standalone.
   - `DOME_PROCESS_ROLE=web` en la app pública.
   - Duplica la app como `dome-provider-worker` (misma imagen y env, sin dominio) con `DOME_PROCESS_ROLE=worker`.
   - Opcionales, vacíos hasta que los tengas: `APNS_*`, `CENTRIFUGO_*`, `REALTIME_PUBLIC_URL`, `METRICS_TOKEN`, `UPSTREAM_TIMEOUT_MS`, `DATABASE_POOL_MAX`, `DATABASE_PREPARE`.

5. **Landing** (uuid `p1yng8mfa3wf3tv82wa8dzdd`).
   - `PUBLIC_RELEASES_INDEX_URL=https://dl.dowi.es/index.json` si no quieres el valor por defecto.
   - `PUBLIC_DOME_ACCOUNT_URL` sigue siendo el login del provider.
   - Hasta que publiques un `index.json`, `/download` muestra el estado vacío.

## Cuando quieras escalar (no bloquea el primer despliegue)

6. **Centrifugo** `centrifugo/centrifugo:v6` en `rt.dowi.es`. HMAC de cliente, API key, engine Redis, transportes `uni_sse` y websocket, namespaces `sync` y `remote`. Luego rellena `CENTRIFUGO_API_URL`, `CENTRIFUGO_API_KEY`, `CENTRIFUGO_TOKEN_HMAC_SECRET` y `REALTIME_PUBLIC_URL` en el provider. En desktop el gateway solo arranca si el ajuste `realtime_gateway_enabled` es `true`.

7. **APNs** del companion: clave `.p8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_TOPIC` (bundle id), `APNS_ENV=production`.

8. **PgBouncer** en modo transacción. Ver `dome-provider/infra/pgbouncer.env.example`. Las migraciones siguen yendo directas a Postgres.

9. **Segundo nodo**, túnel `cloudflared` con el mismo token, Redis Sentinel y backups. Pasos en `dome-provider/infra/second-node.md` y restauración en `dome-provider/docs/runbooks/restore.md`.

10. **Observabilidad**: Prometheus scrapea `/api/metrics` con `METRICS_TOKEN`, Grafana y Uptime Kuma en `status.dowi.es`.

## Qué no va en Coolify

Las releases de Dome se compilan a mano en Mac, Windows y Linux (`pnpm run release:build` / `release:publish` / `release:promote`). Procedimiento: `.claude/sops/release.md`.

No pases el repo a privado ni borres las GitHub Releases hasta que una versión puente (con el feed `dl.dowi.es` ya embebido) esté instalada en los clientes actuales. Si no, las instalaciones 2.8.x dejan de actualizarse.
