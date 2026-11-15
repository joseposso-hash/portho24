-- Portho24 | Preparacion de datos de demostracion: Santa Coloma
-- Crea 9 torres y 8 apartamentos por torre (72 viviendas).
--
-- PREPARACION:
-- 1. Aplicar primero sql/housing_model_multitenant.sql.
-- 2. Confirmar que el nombre y la distribucion (9 x 8) son correctos.
-- 3. Ejecutar este script en el proyecto Supabase de demostracion.
--
-- SEGURIDAD:
-- - Crea el tenant Santa Coloma con un UUID fijo e idempotente.
-- - Clasifica unicamente ese tenant como apartments.
-- - Rechaza conflictos con un tenant existente de otro nombre o modelo.
-- - No modifica ni elimina tenants, viviendas, usuarios o registros existentes.
-- - Solo inserta torres/unidades faltantes.
-- - No crea usuarios ni credenciales.

BEGIN;

DO $$
DECLARE
  v_tenant_id uuid := '8c6f4e21-7d3a-4b91-9f25-6a2d8c0e51b7';
  v_housing_model text;
  v_tenant_name text;
  v_tower_count integer;
  v_unit_count integer;
BEGIN
  -- Crear el tenant de demostracion una sola vez. El UUID fijo evita duplicados.
  INSERT INTO public.tenants (id, name, type, address)
  VALUES (v_tenant_id, 'Santa Coloma', 'residential', NULL)
  ON CONFLICT (id) DO NOTHING;

  -- Bloquear y verificar que el UUID no pertenezca a otro conjunto.
  SELECT name, housing_model
    INTO v_tenant_name, v_housing_model
  FROM public.tenants
  WHERE id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR v_tenant_name IS DISTINCT FROM 'Santa Coloma' THEN
    RAISE EXCEPTION
      'El UUID reservado para Santa Coloma ya existe con otro nombre. No se modifico ningun otro conjunto.';
  END IF;

  IF v_housing_model IS NULL THEN
    UPDATE public.tenants
    SET housing_model = 'apartments'
    WHERE id = v_tenant_id
      AND housing_model IS NULL;
    v_housing_model := 'apartments';
  END IF;

  IF v_housing_model IS DISTINCT FROM 'apartments' THEN
    RAISE EXCEPTION
      'El tenant debe estar clasificado como apartments. Valor actual: %',
      COALESCE(v_housing_model, 'NULL');
  END IF;

  -- Evita ejecuciones simultaneas del mismo seed para este tenant.
  PERFORM pg_advisory_xact_lock(hashtext(v_tenant_id::text)::bigint);

  -- Crear unicamente las torres faltantes.
  INSERT INTO public.towers (tenant_id, name)
  SELECT v_tenant_id, format('Torre %s', n)
  FROM generate_series(1, 9) AS series(n)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.towers t
    WHERE t.tenant_id = v_tenant_id
      AND lower(trim(t.name)) = lower(format('Torre %s', n))
  );

  -- Crear apartamentos 101-108 en cada una de las nueve torres.
  -- La identificacion de cada vivienda se conserva por su UUID (unit_id);
  -- el codigo puede repetirse entre torres sin generar ambiguedad.
  INSERT INTO public.units (tower_id, code)
  SELECT t.id, (100 + apartment_number)::text
  FROM public.towers t
  CROSS JOIN generate_series(1, 8) AS apartments(apartment_number)
  WHERE t.tenant_id = v_tenant_id
    AND lower(trim(t.name)) IN (
      'torre 1', 'torre 2', 'torre 3',
      'torre 4', 'torre 5', 'torre 6',
      'torre 7', 'torre 8', 'torre 9'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.units u
      WHERE u.tower_id = t.id
        AND u.code = (100 + apartment_number)::text
    );

  SELECT count(*)
    INTO v_tower_count
  FROM public.towers
  WHERE tenant_id = v_tenant_id
    AND lower(trim(name)) IN (
      'torre 1', 'torre 2', 'torre 3',
      'torre 4', 'torre 5', 'torre 6',
      'torre 7', 'torre 8', 'torre 9'
    );

  SELECT count(*)
    INTO v_unit_count
  FROM public.units u
  JOIN public.towers t ON t.id = u.tower_id
  WHERE t.tenant_id = v_tenant_id
    AND lower(trim(t.name)) IN (
      'torre 1', 'torre 2', 'torre 3',
      'torre 4', 'torre 5', 'torre 6',
      'torre 7', 'torre 8', 'torre 9'
    )
    AND u.code IN ('101','102','103','104','105','106','107','108');

  IF v_tower_count <> 9 OR v_unit_count <> 72 THEN
    RAISE EXCEPTION
      'Validacion fallida: se esperaban 9 torres y 72 apartamentos; encontrados: % torres y % apartamentos. Se revierte la transaccion.',
      v_tower_count, v_unit_count;
  END IF;

  RAISE NOTICE
    'Santa Coloma listo: % torres y % apartamentos. No se crearon usuarios.',
    v_tower_count, v_unit_count;
END
$$;

COMMIT;
