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

En Railway, usar `services/whatsapp-agent` como directorio raíz, `pnpm install` como instalación, `pnpm build` como build y `pnpm start` como comando de inicio. Si faltan las tres variables comerciales (`OPENAI_API_KEY`, `WHATSAPP_AGENT_RHINOS_URL` y `WHATSAPP_AGENT_SERVICE_TOKEN`), el servicio mantiene `/health` disponible pero no reclama trabajos: así nunca confirma un procesamiento sin responder al cliente.
