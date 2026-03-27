-- ─────────────────────────────────────────────────────────────────────────────
-- Función: get_metrics
--
-- Devuelve todos los datos que necesita /API/metrics en una sola llamada RPC,
-- reemplazando la descarga de potencialmente miles de filas de conversations y
-- messages con agregaciones SQL ejecutadas directamente en la base de datos.
--
-- Parámetros:
--   p_org_id  UUID    - organización del usuario autenticado
--   p_days    INTEGER - ventana de tiempo (1–90 días hacia atrás desde ahora)
--
-- Cómo ejecutar:
--   1. Ve a tu proyecto en https://supabase.com/dashboard
--   2. Abre el SQL Editor
--   3. Pega y ejecuta este archivo completo
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_metrics(p_org_id UUID, p_days INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER   -- corre con permisos del creador; válido porque filtramos por org
AS $$
DECLARE
  v_since       TIMESTAMPTZ := now() - (p_days || ' days')::INTERVAL;
  v_today       TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'UTC');
  v_result      JSON;
BEGIN

  WITH

  -- ── KPIs de conversaciones ─────────────────────────────────────────────────
  conv_kpis AS (
    SELECT
      COUNT(*)                                                        AS convs_period,
      COUNT(*) FILTER (WHERE created_at >= v_today)                   AS convs_today,
      COUNT(*) FILTER (WHERE mode = 'bot')                            AS bot_convs,
      COUNT(*) FILTER (WHERE mode = 'agent')                          AS agent_convs,
      COUNT(*) FILTER (WHERE status = 'closed')                       AS closed_convs
    FROM conversations
    WHERE organization_id = p_org_id
      AND created_at      >= v_since
  ),

  -- ── Conversaciones abiertas en este momento (fuera de la ventana temporal) ─
  open_convs AS (
    SELECT COUNT(*) AS open_count
    FROM conversations
    WHERE organization_id = p_org_id
      AND status           = 'open'
  ),

  -- ── KPIs de mensajes ───────────────────────────────────────────────────────
  msg_kpis AS (
    SELECT COUNT(*) AS msgs_period
    FROM messages
    WHERE organization_id = p_org_id
      AND created_at      >= v_since
  ),

  -- ── Contactos nuevos en el período ────────────────────────────────────────
  contact_kpis AS (
    SELECT COUNT(*) AS contacts_period
    FROM contacts
    WHERE organization_id = p_org_id
      AND created_at      >= v_since
  ),

  -- ── Buckets diarios de conversaciones (para el gráfico de barras) ─────────
  conv_by_day AS (
    SELECT
      (created_at AT TIME ZONE 'UTC')::DATE::TEXT AS date,
      COUNT(*)                                    AS convs
    FROM conversations
    WHERE organization_id = p_org_id
      AND created_at      >= v_since
    GROUP BY 1
  ),

  -- ── Buckets diarios de mensajes por dirección ─────────────────────────────
  msg_by_day AS (
    SELECT
      (created_at AT TIME ZONE 'UTC')::DATE::TEXT AS date,
      COUNT(*) FILTER (WHERE direction = 'inbound')  AS inbound,
      COUNT(*) FILTER (WHERE direction != 'inbound') AS outbound
    FROM messages
    WHERE organization_id = p_org_id
      AND created_at      >= v_since
    GROUP BY 1
  ),

  -- ── Distribución por canal ─────────────────────────────────────────────────
  conv_by_channel AS (
    SELECT
      COALESCE(channel, 'whatsapp') AS channel,
      COUNT(*)                      AS count
    FROM conversations
    WHERE organization_id = p_org_id
      AND created_at      >= v_since
    GROUP BY 1
    ORDER BY 2 DESC
  ),

  -- ── Distribución por tipo de remitente ────────────────────────────────────
  msg_by_sender AS (
    SELECT
      sender_type,
      COUNT(*) AS count
    FROM messages
    WHERE organization_id = p_org_id
      AND created_at      >= v_since
      AND sender_type IN ('contact', 'bot', 'agent')
    GROUP BY 1
  ),

  -- ── Serie de fechas completa (sin huecos) para el gráfico ─────────────────
  date_series AS (
    SELECT (v_since::DATE + s)::TEXT AS date
    FROM generate_series(0, p_days - 1) AS s
  )

  SELECT json_build_object(
    'kpis', (
      SELECT json_build_object(
        'convsPeriod',       ck.convs_period,
        'convsToday',        ck.convs_today,
        'botConvs',          ck.bot_convs,
        'agentConvs',        ck.agent_convs,
        'closedConvsPeriod', ck.closed_convs,
        'openConvs',         ok.open_count,
        'msgsPeriod',        mk.msgs_period,
        'contactsPeriod',    ctk.contacts_period,
        'msgsPerConv',       CASE WHEN ck.convs_period > 0
                               THEN ROUND((mk.msgs_period::NUMERIC / ck.convs_period) * 10) / 10
                               ELSE 0 END
      )
      FROM conv_kpis ck, open_convs ok, msg_kpis mk, contact_kpis ctk
    ),
    'charts', json_build_object(
      'byDay', (
        SELECT json_agg(
          json_build_object(
            'date',     ds.date,
            'convs',    COALESCE(cd.convs,   0),
            'inbound',  COALESCE(md.inbound, 0),
            'outbound', COALESCE(md.outbound,0)
          )
          ORDER BY ds.date
        )
        FROM date_series ds
        LEFT JOIN conv_by_day cd ON cd.date = ds.date
        LEFT JOIN msg_by_day  md ON md.date = ds.date
      ),
      'byChannel', (
        SELECT COALESCE(json_agg(
          json_build_object('channel', channel, 'count', count)
        ), '[]'::JSON)
        FROM conv_by_channel
      ),
      'bySender', (
        SELECT json_build_object(
          'contact', COALESCE(MAX(count) FILTER (WHERE sender_type = 'contact'), 0),
          'bot',     COALESCE(MAX(count) FILTER (WHERE sender_type = 'bot'),     0),
          'agent',   COALESCE(MAX(count) FILTER (WHERE sender_type = 'agent'),   0)
        )
        FROM msg_by_sender
      )
    )
  ) INTO v_result
  FROM conv_kpis ck;  -- necesitamos exactamente 1 fila del FROM para el SELECT final

  RETURN v_result;
END;
$$;

-- Permisos: solo el service role (usado en API routes) puede llamar esta función.
-- El anon/authenticated key NO puede llamarla directamente desde el cliente.
REVOKE ALL ON FUNCTION get_metrics(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_metrics(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION get_metrics(UUID, INTEGER) FROM authenticated;
