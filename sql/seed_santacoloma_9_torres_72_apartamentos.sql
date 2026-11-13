-- Portho24 | Preparacion de datos de demostracion: Santa Coloma
-- Crea 9 torres y 8 apartamentos por torre (72 viviendas).
--
-- PREPARACION:
-- 1. Crear previamente el tenant de Santa Coloma desde el flujo administrativo autorizado.
-- 2. Aplicar sql/housing_model_multitenant.sql.
-- 3. Reemplazar el UUID de ejemplo por el tenant_id real de Santa Coloma.
-- 4. Revisar el patron de codigos 101-108 antes de ejecutar.
--
-- SEGURIDAD:
-- - Este script NO crea el tenant.
-- - No modifica ni elimina viviendas, torres, usuarios o registros existentes.
-- - Solo inserta torres/unidades faltantes para el tenant indicado.
-- - No ejecutar en produccion hasta confirmar el tenant_id.

BEGIN;

DO $$
DECLARE
  v_tenant_id uuid := '00000000-0000-0000-0000-000000000000';
  v_housing_model text;
  v_tower_count integer;
  v_unit_count integer;
BEGIN
  IF v_tenant_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION
      'Configura v_tenant_id con el UUID real del tenant Santa Coloma antes de ejecutar.';
  END IF;

  SELECT housing_model
    INTO v_housing_model
  FROM public.tenants
  WHERE id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'No existe el tenant indicado. Este script no crea conjuntos.';
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
    AND t.name IN (
      'Torre 1', 'Torre 2', 'Torre 3',
      'Torre 4', 'Torre 5', 'Torre 6',
      'Torre 7', 'Torre 8', 'Torre 9'
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
    AND name IN (
      'Torre 1', 'Torre 2', 'Torre 3',
      'Torre 4', 'Torre 5', 'Torre 6',
      'Torre 7', 'Torre 8', 'Torre 9'
    );

  SELECT count(*)
    INTO v_unit_count
  FROM public.units u
  JOIN public.towers t ON t.id = u.tower_id
  WHERE t.tenant_id = v_tenant_id
    AND t.name IN (
      'Torre 1', 'Torre 2', 'Torre 3',
      'Torre 4', 'Torre 5', 'Torre 6',
      'Torre 7', 'Torre 8', 'Torre 9'
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
