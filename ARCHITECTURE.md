# Arquitectura de contactos-saas

Plataforma SaaS multi-tenant de mensajería WhatsApp con agentes IA. Permite que múltiples organizaciones gestionen conversaciones con sus contactos a través de WhatsApp, con bots configurables que usan OpenAI o Anthropic, seguimientos automáticos y escalación a humanos.

---

## Stack tecnológico

| Capa | Tecnología | Justificación |
|---|---|---|
| Framework | Next.js 16 (App Router) | API routes + frontend en un solo repo, serverless nativo |
| Base de datos | Supabase (PostgreSQL) | Auth + DB + Realtime en un solo servicio, RLS nativo |
| Hosting | Vercel | Deploy automático, Cron Jobs, Serverless Functions escalables |
| LLM | OpenAI (GPT-4o) / Anthropic (Claude) | Cada org puede tener sus propias API keys; env vars como fallback |
| WhatsApp | Meta Graph API v23.0 | Oficial; cada org tiene su propio `phone_number_id` |
| Estilos | Tailwind CSS v4 | Sin librerías de UI; componentes escritos a mano |

Sin ORM (queries directas con supabase-js), sin estado global (React hooks nativos), sin Docker.

---

## Esquema de base de datos

```
organizations          → credenciales WA y LLM por cliente
profiles               → usuarios del sistema (org_id, role)
contacts               → directorio de personas (phone, email, org_id)
conversations          → hilo de mensajería (contact_id, channel, mode, pipeline_stage)
messages               → mensajes individuales (conversation_id, direction, content)
agents                 → configuración de bots IA (instructions, llm_model, followups JSONB)
pipeline_stages        → etapas del embudo (name, position, agent_id)
agent_integrations     → conexiones a Dentalink/Admintour por agente (config JSONB)
agent_csv_knowledge    → bases de conocimiento tabulares (rows JSONB, search_column)
message_debounce       → store temporal para el sistema anti-flood (conversation_id, last_message_at)
settings               → configuración por org (ej: message_debounce_seconds)
webhook_events         → log de eventos raw de Meta
```

**RLS habilitado** en: `agent_integrations`, `agent_csv_knowledge`.
Las demás tablas filtran por `organization_id` en el código de aplicación.

---

## Flujo principal de mensajes

```
[Usuario WhatsApp]
       ↓
[Meta Webhook POST /API/webhook/whatsapp]
  - Verifica firma HMAC-SHA256 con app_secret de la org
  - Identifica organización por phone_number_id
  - Guarda evento en webhook_events
  - Busca/crea contacto y conversación
  - Guarda mensaje en messages
  - Llama a scheduleWorker() con next/server after() [fire-and-forget]
       ↓
[POST /API/agent-worker]  ← maxDuration: 60s
  - Lee tiempo de debounce desde settings (default: 5s, max: 8s)
  - Registra timestamp en message_debounce (upsert "último gana")
  - Polling activo cada 500ms hasta que pase el debounce
  - Si sigue siendo el mensaje más reciente: elimina fila de debounce (lock atómico)
  - Concatena mensajes del window y llama a agent-reply
       ↓
[POST /API/agent-reply]  ← maxDuration: 60s
  - Detecta palabras clave de escalación (agente, humano, operador…)
  - Carga conversación + agente asignado a la pipeline_stage
  - Carga integraciones activas (Dentalink/Admintour) y CSV knowledge bases
  - Construye historial (últimos 20 msgs, limitado a 12,000 chars)
  - Llama a OpenAI o Anthropic con function calling (hasta 5 rondas de tool calls)
  - Retorna { action: "reply"|"escalate"|"skip", text?, reason? }
       ↓
[agent-worker recibe la respuesta]
  - Si "reply": envía mensaje por WhatsApp Graph API, guarda en messages
  - Si "escalate": cambia mode a "agent", inserta nota interna en messages
       ↓
[Supabase Realtime → Frontend]
  - useSupabaseInbox.ts escucha postgres_changes en messages y conversations
  - La bandeja de soporte se actualiza en tiempo real sin polling
```

---

## Flujo de seguimientos automáticos (followups)

```
[Vercel Cron (desactivado) → GET /API/followups/cron]
  - Carga todas las conversaciones abiertas en modo bot con last_bot_at en las últimas 24h
  - Para cada una: busca agente por pipeline_stage, lee followups[] del agente
  - Calcula tiempo acumulado (delays son acumulativos entre seguimientos)
  - Si elapsed >= cumulativeDelay y no fue enviado (followup_sent[]): dispara
  - Llama a /API/agent-reply con followup_objective para generar texto
  - Envía por WhatsApp y guarda en DB
  - Máximo un followup por conversación por ejecución del cron
```

Los `followups` se almacenan como JSONB en `agents.followups`:
```json
[{ "delay_hours": 1, "delay_minutes": 0, "objective": "Recordar al cliente", "enabled": true }]
```

`followup_sent` en `conversations` es un array de índices (ej: `[0, 1]`). Se resetea a `[]` cuando el contacto responde.

---

## Multi-tenancy

- Cada `organization` tiene sus propias credenciales: `whatsapp_token`, `whatsapp_phone_number_id`, `whatsapp_app_secret`, `openai_api_key`, `anthropic_api_key`
- Las env vars del proyecto actúan como **fallback** para desarrollo local o tenants sin credenciales propias
- La identificación del tenant en el webhook se hace por `phone_number_id` del payload de Meta
- Los `profiles` tienen `organization_id` → los usuarios solo ven datos de su org

---

## Seguridad entre servicios internos

| Comunicación | Mecanismo |
|---|---|
| Meta → webhook | HMAC-SHA256 (`x-hub-signature-256`) verificado con `whatsapp_app_secret` de la org |
| webhook → agent-worker | Header `x-internal-secret` + `INTERNAL_API_SECRET` env var |
| agent-worker → agent-reply | Header `x-internal-secret` + `INTERNAL_API_SECRET` env var |
| followups/cron → agent-reply | Header `x-internal-secret` + `INTERNAL_API_SECRET` env var |
| Vercel Cron → cron routes | Header `Authorization: Bearer CRON_SECRET` |
| Frontend → Supabase | Supabase Auth (JWT por cookie, gestionado con `@supabase/ssr`) |

---

## Integraciones externas

| Plataforma | Tipo | Implementación |
|---|---|---|
| Dentalink | Sistema dental (pacientes, citas, dentistas) | `app/lib/integrations/executors/dentalink.js` |
| Admintour | Sistema hotelero (disponibilidad, reservas) | `app/lib/integrations/executors/admintour.js` |

Las funciones disponibles por plataforma se definen en `app/lib/integrations/catalog.js`. El catálogo devuelve los schemas de tool calling para el LLM. Las credenciales se guardan en `agent_integrations.config` (JSONB encriptado en tránsito por Supabase TLS).

La sincronización periódica de contactos desde Dentalink/Admintour se hace via `/API/integrations/cron` (schedule en catalog.js).

---

## Bases de conocimiento CSV

- El usuario sube un CSV desde el dashboard de agentes (`/dashboard/agentes`)
- El parsing ocurre **en el navegador** con FileReader API (sin upload a storage)
- Los datos se guardan como `rows: JSONB` en `agent_csv_knowledge`
- En tiempo de inferencia, el LLM recibe una tool function de búsqueda exacta por columna (`search_column`)
- No hay embeddings ni búsqueda semántica; la búsqueda es `===` case-insensitive

---

## Realtime (bandeja de soporte)

`useSupabaseInbox.ts` suscribe a tres eventos via `postgres_changes`:
- `INSERT` en `messages` → agrega mensaje al hilo visible
- `INSERT` en `conversations` → agrega conversación nueva a la lista
- `UPDATE` en `conversations` → actualiza contador de no leídos, último mensaje, modo

Los tres canales filtran por `organization_id` usando el filtro nativo de Supabase Realtime (`filter: organization_id=eq.${orgId}`), por lo que no se reciben eventos de otras organizaciones.

---

## Variables de entorno requeridas

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # solo en servidor; NUNCA en cliente

# WhatsApp (fallback si la org no tiene los suyos)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
META_GRAPH_VERSION=v23.0

# LLM (fallback si la org no tiene los suyos)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Seguridad interna
INTERNAL_API_SECRET=               # compartido entre webhook, worker y agent-reply
CRON_SECRET=                       # para autenticar Vercel Cron
```

---

## Configuración de Vercel (`vercel.json`)

| Función | maxDuration | Por qué |
|---|---|---|
| `agent-worker` | 60s | Polling activo de debounce (hasta 8s) + llamada a agent-reply |
| `agent-reply` | 60s | Llamada a LLM + hasta 5 rondas de tool calls |
| `webhook/whatsapp` | 30s | Procesamiento del payload + scheduleWorker() |
| `followups/cron` | 60s | Procesa N conversaciones en serie, cada una llama al LLM |

El cron de followups está actualmente **desactivado** (`"crons": []` en `vercel.json`). Para reactivarlo, restaurar la entrada con el schedule deseado.

---

## Deuda técnica conocida y plan de escalabilidad

### Problema crítico: debounce con polling activo
`agent-worker` mantiene una Serverless Function abierta hasta 60s haciendo polling a DB cada 500ms. Esto no escala más allá de ~50 clientes concurrentes.

**Solución planeada**: reemplazar con Inngest (durable functions) o Upstash QStash (HTTP queue) para que el debounce sea event-driven en lugar de blocking.

### Problema medio: cron sin paginación
`/API/followups/cron` carga todas las conversaciones activas de todas las organizaciones en una sola query. Con 1,000+ clientes esto puede exceder el timeout de 60s.

**Solución planeada**: procesar en batches de 50 organizaciones por ejecución, con cursor de paginación.

### ✅ Realtime con filtro de organización (resuelto)
`useSupabaseInbox.ts` usa `filter: organization_id=eq.${orgId}` en los tres canales. No hay tráfico innecesario entre orgs.

### Problema menor: RLS incompleto
Solo `agent_integrations` y `agent_csv_knowledge` tienen Row Level Security. Las tablas `messages`, `conversations`, `contacts` dependen del filtrado en código de aplicación.

**Solución planeada**: extender RLS a todas las tablas usando la función `get_org_id()` ya existente. Trabajo de 1-2 días.

### Sin mecanismo de retry
Si el LLM da error 500, la función de Vercel hace timeout, o Meta falla al recibir el mensaje, el mensaje se pierde silenciosamente. Solo se loggea en Vercel logs.

**Solución planeada**: usar Inngest para retry automático con backoff exponencial y dead letter queue.

---

## Límites operacionales actuales

| Recurso | Límite actual | Cuándo se alcanza |
|---|---|---|
| Vercel maxDuration | 60s por función | Siempre en agent-worker y agent-reply |
| Supabase Realtime | 500 conexiones (Pro) | ~100 clientes con 5 ejecutivos de soporte c/u |
| Historial LLM | 12,000 chars (~3,000 tokens) | Siempre; diseñado intencionalmente |
| Tool call rounds | 5 rondas máximas | Conversaciones complejas con múltiples consultas |
| Debounce window | 0-8s (configurable por org) | Default: 5s |
| Followups | Máx 1 por conversación por ejecución de cron | Diseñado intencionalmente para no saturar |

---

## Migraciones SQL

Las migraciones están en `supabase/migrations/` y se aplican manualmente con Supabase CLI o desde el dashboard:

| Archivo | Descripción |
|---|---|
| `20240316_contacts_first_last_name.sql` | Separar nombre en first_name + last_name |
| `20260313_agent_csv_knowledge.sql` | Tabla para bases de conocimiento CSV |
| `20260316_agent_followups.sql` | Columna followups JSONB en agents |
| `20260316_agent_tools.sql` | Tabla agent_integrations + pipeline_stages |
| `20260317_conversation_followup_tracking.sql` | Columnas followup_sent, last_bot_at, last_inbound_at en conversations |
