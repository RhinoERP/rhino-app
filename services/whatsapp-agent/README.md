# WhatsApp Agent Worker

Worker persistente para Railway del canal de WhatsApp. Reclama en forma exclusiva los trabajos creados por el webhook, reintenta fallas transitorias y expone `GET /health`.

## Variables de entorno

```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
WHATSAPP_AGENT_WORKER_ID=<identificador opcional>
WHATSAPP_AGENT_POLL_INTERVAL_MS=1000
WHATSAPP_META_ACCESS_TOKEN=<token de Meta para mensajes salientes>
WHATSAPP_META_GRAPH_VERSION=v23.0
WHATSAPP_AGENT_RHINOS_URL=https://<tu-dominio-rhinos>
WHATSAPP_AGENT_SERVICE_TOKEN=<secreto-compartido-con-Rhinos>
OPENAI_API_KEY=<clave-del-proveedor-de-modelo>
WHATSAPP_AGENT_OPENAI_MODEL=gpt-5-mini
```

## Deploy en Railway

Usar la **raíz del repositorio `/`**, con Node 22, para que esté disponible el
lockfile y el workspace de pnpm versionados. No usar como raíz
`services/whatsapp-agent`: allí no hay un lockfile independiente.

- Instalación: `pnpm install --frozen-lockfile`.
- Build: `pnpm --filter @rhinos/whatsapp-agent build`.
- Inicio: `pnpm --filter @rhinos/whatsapp-agent start`.
- Healthcheck: `/health`. Confirmar también `configured: true` en el JSON.
- Watch paths: `/services/whatsapp-agent/**`, `/pnpm-lock.yaml`, `/pnpm-workspace.yaml`, `/package.json`.

Sin cualquiera de las cuatro variables `OPENAI_API_KEY`,
`WHATSAPP_AGENT_RHINOS_URL`, `WHATSAPP_AGENT_SERVICE_TOKEN` y
`WHATSAPP_META_ACCESS_TOKEN`, el servicio mantiene `/health` disponible con
`configured: false` y no reclama trabajos. Las credenciales de Supabase sí son
obligatorias para iniciar el proceso.

Los trabajos de empresas sin `whatsapp_enabled = true` o inactivas no se
reclaman. El sandbox de Rhinos no necesita este worker: se ejecuta en Vercel con
el modelo y datos reales de la organización, sin enviar mensajes a Meta.

Procedimiento completo, incluyendo las migraciones históricas con versiones
duplicadas y los toggles de superadmin:
[docs/whatsapp-deploy.md](../../docs/whatsapp-deploy.md).
