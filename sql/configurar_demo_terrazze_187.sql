-- Terrazze 187: estructura demo de 1 torre, 9 pisos y 54 apartamentos.
-- Requiere ejecutar primero sql/housing_model_multitenant.sql.
-- Numeración: 101-106, 201-206, ... 901-906.
-- No crea, elimina ni modifica usuarios. No borra torres ni apartamentos existentes.
-- Si encuentra más de una torre o unidades con códigos ajenos al patrón, aborta
-- para evitar mover o eliminar datos sin revisión.

BEGIN;

DO $$
DECLARE
  v_tenant_id uuid := 'd8c7c4e1-7511-44d3-8b4b-65ea5608a2f7';
  v_tower_id uuid;
  v_tower_count integer;
  v_unit_count integer;
  v_invalid_count integer;
  v_duplicate_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'No existe el tenant de Terrazze 187: %', v_tenant_id;
  END IF;

  UPDATE public.tenants
  SET housing_model = 'apartments'
  WHERE id = v_tenant_id;

  SELECT count(*)
  INTO v_tower_count
  FROM public.towers
  WHERE tenant_id = v_tenant_id;

  IF v_tower_count > 1 THEN
    RAISE EXCEPTION
      'Terrazze 187 tiene % torres registradas. No se modificó ninguna; revisar antes de consolidar.',
      v_tower_count;
  ELSIF v_tower_count = 0 THEN
    INSERT INTO public.towers (tenant_id, tower)
    VALUES (v_tenant_id, 'Torre 1')
    RETURNING id INTO v_tower_id;
  ELSE
    SELECT id
    INTO v_tower_id
    FROM public.towers
    WHERE tenant_id = v_tenant_id
    LIMIT 1;

    UPDATE public.towers
    SET tower = 'Torre 1'
    WHERE id = v_tower_id;
  END IF;

  SELECT count(*)
  INTO v_unit_count
  FROM public.units
  WHERE tower_id = v_tower_id;

  IF v_unit_count > 54 THEN
    RAISE EXCEPTION
      'La torre ya tiene % apartamentos; se esperaba un máximo de 54. No se modificaron unidades.',
      v_unit_count;
  END IF;

  SELECT count(*)
  INTO v_invalid_count
  FROM public.units
  WHERE tower_id = v_tower_id
    AND code !~ '^[1-9]0[1-6]$';

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION
      'Hay % apartamentos con códigos distintos al patrón 101-106 ... 901-906. Revisar antes de completar.',
      v_invalid_count;
  END IF;

  SELECT count(*)
  INTO v_duplicate_count
  FROM (
    SELECT code
    FROM public.units
    WHERE tower_id = v_tower_id
    GROUP BY code
    HAVING count(*) > 1
  ) duplicates;

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Hay códigos de apartamento duplicados en Terrazze 187. No se modificaron unidades.';
  END IF;

  INSERT INTO public.units (tower_id, code, floor, has_parking)
  SELECT
    v_tower_id,
    (f.floor_no::text || '0' || a.apartment_no::text),
    f.floor_no,
    false
  FROM generate_series(1, 9) AS f(floor_no)
  CROSS JOIN generate_series(1, 6) AS a(apartment_no)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.units u
    WHERE u.tower_id = v_tower_id
      AND u.code = (f.floor_no::text || '0' || a.apartment_no::text)
  );

  UPDATE public.units
  SET floor = left(code, 1)::integer
  WHERE tower_id = v_tower_id
    AND code ~ '^[1-9]0[1-6]$';

  SELECT count(*)
  INTO v_unit_count
  FROM public.units
  WHERE tower_id = v_tower_id;

  IF v_unit_count <> 54 THEN
    RAISE EXCEPTION
      'La configuración terminó con % apartamentos en vez de 54. Se revierte la transacción.',
      v_unit_count;
  END IF;
END;
$$;

-- Resultado de verificación antes de confirmar.
SELECT
  t.id AS tower_id,
  t.tower AS torre,
  count(u.id) AS apartamentos,
  min(u.floor) AS primer_piso,
  max(u.floor) AS ultimo_piso
FROM public.towers t
LEFT JOIN public.units u ON u.tower_id = t.id
WHERE t.tenant_id = 'd8c7c4e1-7511-44d3-8b4b-65ea5608a2f7'
GROUP BY t.id, t.tower;

COMMIT;
