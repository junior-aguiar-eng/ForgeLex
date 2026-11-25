-- Supabase project mmywgqttfthtwntjkqgh.
-- O Auth passou a recusar tokens de cliente OAuth em GET /auth/v1/user/oauth/grants
-- (403 "OAuth client access tokens are not allowed to access this endpoint").
-- A API ForgeLex consulta a autorização vigente por esta função, apenas com a
-- chave secreta do servidor (service_role), depois de /auth/v1/user validar o token.
-- O retorno reproduz o formato do Auth (RFC 3339 em UTC, fração sem zeros à
-- direita), pois oauth_granted_at é comparado como texto nos vínculos já gravados.
--
-- A função fica no schema isolado forgelex_api, o único a expor na Data API
-- (Settings > Data API > Exposed schemas = forgelex_api). As tabelas de public
-- continuam fora da Data API. Somente service_role usa o schema e executa a função.

BEGIN;

DROP FUNCTION IF EXISTS public.forgelex_oauth_grant(uuid, uuid);

CREATE SCHEMA IF NOT EXISTS forgelex_api;
REVOKE ALL ON SCHEMA forgelex_api FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA forgelex_api TO service_role;

CREATE OR REPLACE FUNCTION forgelex_api.oauth_grant(p_user_id uuid, p_client_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT rtrim(rtrim(to_char(c.granted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), '0'), '.') || 'Z'
  FROM auth.oauth_consents AS c
  WHERE c.user_id = p_user_id
    AND c.client_id = p_client_id
    AND c.revoked_at IS NULL
  ORDER BY c.granted_at DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION forgelex_api.oauth_grant(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION forgelex_api.oauth_grant(uuid, uuid) TO service_role;

DO $$
BEGIN
  IF has_schema_privilege('anon', 'forgelex_api', 'USAGE')
    OR has_schema_privilege('authenticated', 'forgelex_api', 'USAGE')
    OR has_function_privilege('anon', 'forgelex_api.oauth_grant(uuid, uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'forgelex_api.oauth_grant(uuid, uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'forgelex_api.oauth_grant(uuid, uuid)', 'EXECUTE')
    OR EXISTS (
      SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'forgelex_api'
    ) THEN
    RAISE EXCEPTION 'OAuth grant lookup privilege verification failed';
  END IF;
END
$$;

COMMIT;
