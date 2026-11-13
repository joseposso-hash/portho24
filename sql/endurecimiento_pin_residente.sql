CREATE OR REPLACE FUNCTION public.consume_package_pin_resident_request(
    p_tenant_id uuid,
    p_resident_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_count integer;
BEGIN
    IF p_tenant_id IS NULL OR p_resident_id IS NULL THEN
        RAISE EXCEPTION 'Invalid resident rate limit identity';
    END IF;

    -- Validar que el usuario sea un residente activo
    -- y tenga una unidad asignada dentro del conjunto.
    IF NOT EXISTS (
        SELECT 1
        FROM public.users
        WHERE id = p_resident_id
          AND tenant_id = p_tenant_id
          AND role::text = 'resident'
          AND is_active = true
          AND unit_id IS NOT NULL
    ) THEN
        RETURN false;
    END IF;

    -- Máximo 10 solicitudes por minuto por residente y conjunto.
    INSERT INTO public.package_pin_resident_attempts (
        tenant_id,
        resident_id,
        window_started_at,
        request_count,
        updated_at
    )
    VALUES (
        p_tenant_id,
        p_resident_id,
        now(),
        1,
        now()
    )
    ON CONFLICT (tenant_id, resident_id)
    DO UPDATE SET
        request_count = CASE
            WHEN public.package_pin_resident_attempts.window_started_at
                 <= now() - interval '1 minute'
            THEN 1
            ELSE public.package_pin_resident_attempts.request_count + 1
        END,
        window_started_at = CASE
            WHEN public.package_pin_resident_attempts.window_started_at
                 <= now() - interval '1 minute'
            THEN now()
            ELSE public.package_pin_resident_attempts.window_started_at
        END,
        updated_at = now()
    RETURNING request_count INTO v_count;

    RETURN v_count <= 10;
END;
$function$;
