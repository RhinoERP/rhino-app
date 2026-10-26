# WhatsApp Agent Worker

Worker persistente para Vercel Daemons o Railway del canal de WhatsApp. Reclama en forma exclusiva los trabajos creados por el webhook, reintenta fallas transitorias y expone `GET /health`.

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

## Deploy recomendado: Vercel Daemons

El proyecto Pro de Rhinos puede ejecutar este worker como daemon junto al
frontend. `vercel.json` registra `whatsapp-agent` con cero instancias; activarlo
manualmente después de aplicar la base y configurar las variables de Production.
No hace falta crear otro proyecto o cambiar los comandos de build de Next.

- Imagen: `Dockerfile`, Node 22, Linux amd64, ejecución sin privilegios.
- Tamaño: 1 GiB; iniciar una sola instancia.
- Región configurada: `iad1`; cambiarla si corresponde a la región de Supabase.
- Activación: **Daemons → whatsapp-agent → Scale → 1**.
- Detención: escalar todas las regiones a cero.
- El override de escalado persiste entre despliegues.
- Confirmar en logs `worker configurado; iniciando polling`.
- No hay HTTP entrante al daemon: el webhook de Meta sigue en el frontend.

El worker acepta las mismas `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SECRET_KEY`
que ya usa Rhinos. Configurar también OpenAI, token Meta, URL productiva y secreto
de API interna. Los cambios de variables requieren un nuevo deploy productivo.
Recomendado: `WHATSAPP_AGENT_POLL_INTERVAL_MS=5000`.

```sh
docker build --platform linux/amd64 -t rhino-whatsapp-daemon services/whatsapp-agent
```

El build Docker usa el lockfile independiente de este directorio; el desarrollo
del workspace sigue usando el lockfile raíz. Actualizar ambos al cambiar las
dependencias. El contexto Docker excluye secretos y archivos locales.

## Alternativa: Railway

Usar la raíz del repositorio `/` con Node 22 para instalar desde el lockfile y
workspace raíz. Build: `pnpm --filter @rhinos/whatsapp-agent build`. Inicio:
`pnpm --filter @rhinos/whatsapp-agent start`. Healthcheck: `/health`.

Sin cualquiera de las cuatro variables `OPENAI_API_KEY`,
`WHATSAPP_AGENT_RHINOS_URL`, `WHATSAPP_AGENT_SERVICE_TOKEN` y
`WHATSAPP_META_ACCESS_TOKEN`, el servicio mantiene `/health` disponible con
`configured: false` y no reclama trabajos. Las credenciales de Supabase sí son
obligatorias para iniciar el proceso.

Los trabajos de empresas sin `whatsapp_enabled = true` o inactivas no se
reclaman. El sandbox se ejecuta en las funciones de Vercel, sin este worker.

Procedimiento completo: [docs/whatsapp-deploy.md](../../docs/whatsapp-deploy.md).
