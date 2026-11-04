# IA Comercial · asistente del vendedor por WhatsApp

El vendedor le escribe al WhatsApp de la empresa (el mismo número que usa el
agente de pedidos de clientes). Si su celular está cargado en
**IA Comercial → Configuración → WhatsApp**, lo atiende el asistente comercial;
cualquier otro número sigue yendo a la bandeja de clientes.

## Qué puede hacer el vendedor

| Escribe | Responde |
| --- | --- |
| `hoy` / `ver mi día` | Meta del mes, ruta de hoy, a quién llamar, pendientes y deuda para cobrar (sin IA) |
| `ruta` | Paradas de hoy en orden (sin IA) |
| `pendientes` | Próximos pasos vencidos o de hoy (sin IA) |
| `ayuda` | Lista de atajos |
| Cualquier otra cosa | Asistente con IA: consulta ventas reales y además **anota visitas** (`registrar_visita`) y **crea recordatorios** (`crear_recordatorio`) |

Ejemplos: "Pasé por El Obrero, pidieron 20 kg de muzza", "Recordame llamar a
Morini el jueves", "¿Cuánto me compró Lácteos Catamarca este año?",
"Armame un mensaje para el cliente en riesgo más grande".

Las visitas quedan en `commercial_ai_checkins` (sin GPS, con
"Cargado por WhatsApp"), en el historial del cliente y, si el cliente estaba en
la ruta de hoy, la parada queda marcada. Los recordatorios van a
`commercial_ai_tasks` y aparecen en Hoy y en el resumen diario.

Los audios todavía no se procesan: se le pide que lo mande escrito. Cuando se
integre la transcripción de `codex/whatsapp-audio-transcription`, el texto
transcripto entra por el mismo camino (`processSellerMessage`).

## Puesta en marcha

1. Migración: `supabase/migrations/20261104000001_commercial_ai_whatsapp.sql`.
2. Variables de entorno (Vercel):
   - `WHATSAPP_META_ACCESS_TOKEN`, `WHATSAPP_META_APP_SECRET`,
     `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: las mismas del agente de pedidos.
   - `CRON_SECRET`: para el resumen diario (Vercel lo manda solo).
   - `WHATSAPP_SELLER_DIGEST_TEMPLATE`: nombre de la plantilla aprobada en Meta
     (opcional; sin ella el resumen solo llega a quien escribió en las últimas 24 h).
   - `WHATSAPP_SELLER_DIGEST_LANGUAGE`: idioma de la plantilla (por defecto `es_AR`).
3. Cargar el celular de cada vendedor en IA Comercial → Configuración → WhatsApp.

## Resumen diario

`vercel.json` programa `/api/cron/ia-comercial-resumen` de lunes a sábado a las
8:30 (11:30 UTC). Meta solo deja mandar texto libre dentro de las 24 h desde el
último mensaje del vendedor; fuera de esa ventana se manda la plantilla.

Plantilla sugerida para aprobar en Meta (categoría *Utility*, idioma es_AR):

- Nombre: `resumen_vendedor`
- Cuerpo: `Buen día {{1}}, ya está tu día en Rhinos: ruta, a quién llamar y pendientes.`
- Botón de respuesta rápida: `Ver mi día`

Al tocar el botón, el vendedor recibe el resumen completo.
