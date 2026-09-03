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
```

En Railway, usar `services/whatsapp-agent` como directorio raíz, `pnpm install` como instalación, `pnpm build` como build y `pnpm start` como comando de inicio. La fase 2 consume trabajos de transporte y trazabilidad; la fase 3 conectará el procesador al modelo y las herramientas comerciales.
