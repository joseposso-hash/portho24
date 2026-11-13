BEGIN;

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


CREATE OR REPLACE FUNCTION public.register_package_with_pin(
    p_tenant_id uuid,
    p_guard_id uuid,
    p_recipient_unit_id uuid,
    p_courier text,
    p_tracking_number text,
    p_photo_url text,
    p_pin_digest text,
    p_pin_ciphertext text,
    p_pin_iv text,
    p_pin_auth_tag text,
    p_expires_at timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_package_id uuid;
BEGIN
    -- Validar la identidad del vigilante.
    IF p_tenant_id IS NULL OR p_guard_id IS NULL THEN
        RAISE EXCEPTION 'Invalid guard identity';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.users
        WHERE id = p_guard_id
          AND tenant_id = p_tenant_id
          AND role::text = 'guard'
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Unauthorized guard';
    END IF;

    -- Validar los datos del paquete.
    IF p_recipient_unit_id IS NULL
       OR NULLIF(TRIM(p_courier), '') IS NULL
       OR LENGTH(TRIM(p_courier)) > 80
       OR LENGTH(COALESCE(p_tracking_number, '')) > 120
       OR NULLIF(TRIM(p_photo_url), '') IS NULL
    THEN
        RAISE EXCEPTION 'Invalid package data';
    END IF;

    -- Validar que la fotografia pertenezca al almacenamiento
    -- privado y a la carpeta de paquetes de este conjunto.
    IF p_photo_url !~* (
        '^storage://evidences-private/'
        || p_tenant_id::text
        || '/paquetes/'
        || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
        || '\.(jpg|png|webp)$'
    ) THEN
        RAISE EXCEPTION 'Invalid private package photo reference';
    END IF;

    -- Comprobar que la unidad pertenece al conjunto.
    IF NOT EXISTS (
        SELECT 1
        FROM public.units u
        JOIN public.towers t ON t.id = u.tower_id
        WHERE u.id = p_recipient_unit_id
          AND t.tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'Unit does not belong to tenant';
    END IF;

    -- Validar los datos criptograficos del PIN.
    IF p_pin_digest IS NULL
       OR p_pin_digest !~ '^[a-f0-9]{64}$'
       OR NULLIF(TRIM(p_pin_ciphertext), '') IS NULL
       OR NULLIF(TRIM(p_pin_iv), '') IS NULL
       OR NULLIF(TRIM(p_pin_auth_tag), '') IS NULL
    THEN
        RAISE EXCEPTION 'Invalid PIN protection data';
    END IF;

    -- Vigencia maxima de 24 horas.
    IF p_expires_at IS NULL
       OR p_expires_at <= now()
       OR p_expires_at > now() + interval '24 hours'
    THEN
        RAISE EXCEPTION 'Invalid expiration date';
    END IF;

    -- Registrar el paquete sin almacenar el PIN ni su hash
    -- en la tabla principal.
    INSERT INTO public.packages (
        tenant_id,
        recipient_unit_id,
        courier,
        tracking_number,
        photo_url,
        status,
        pin_hash,
        pin_expires_at,
        received_by
    )
    VALUES (
        p_tenant_id,
        p_recipient_unit_id,
        TRIM(p_courier),
        NULLIF(TRIM(p_tracking_number), ''),
        p_photo_url,
        'received',
        NULL,
        NULL,
        p_guard_id
    )
    RETURNING id INTO v_package_id;

    -- Guardar el secreto exclusivamente en la tabla privada.
    INSERT INTO public.package_pin_secrets (
        package_id,
        tenant_id,
        pin_digest,
        pin_ciphertext,
        pin_iv,
        pin_auth_tag,
        expires_at
    )
    VALUES (
        v_package_id,
        p_tenant_id,
        p_pin_digest,
        p_pin_ciphertext,
        p_pin_iv,
        p_pin_auth_tag,
        p_expires_at
    );

    RETURN jsonb_build_object(
        'success', true,
        'package_id', v_package_id
    );
END;
$function$;


COMMIT;
