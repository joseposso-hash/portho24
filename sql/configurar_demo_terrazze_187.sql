-- Terrazze 187: consolidar 54 apartamentos en una sola torre de 9 pisos.
-- Resultado: Torre 1; seis apartamentos por piso; códigos 101-106 ... 901-906.
-- Conserva los UUID de las 54 unidades. No crea ni elimina apartamentos.
-- Requiere ejecutar primero sql/housing_model_multitenant.sql.
-- Ejecutar únicamente después de revisar el inventario actual.
--
-- La distribución se realiza de forma determinista:
-- orden por piso actual, nombre de torre actual y código actual.
-- Los primeros seis registros pasan al piso 1, los siguientes seis al piso 2, etc.
-- Los códigos temporales evitan conflictos con índices únicos durante la reasignación.
-- La segunda torre solo se elimina si ninguna otra tabla conserva referencias a ella.
-- Cualquier validación fallida aborta y revierte toda la transacción.

BEGIN;

DO $$
DECLARE
  v_tenant_id uuid := 'd8c7c4e1-7511-44d3-8b4b-65ea5608a2f7';
  v_tower_count integer;
  v_unit_count integer;
  v_tower_a_id uuid;
  v_tower_b_id uuid;
  v_has_refs boolean;
  fk record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'No existe el tenant de Terrazze 187: %', v_tenant_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenants'
      AND column_name = 'housing_model'
  ) THEN
    RAISE EXCEPTION 'Falta tenants.housing_model. Ejecutar primero sql/housing_model_multitenant.sql.';
  END IF;

  SELECT count(*)
  INTO v_tower_count
  FROM public.towers
  WHERE tenant_id = v_tenant_id;

  IF v_tower_count <> 2 THEN
    RAISE EXCEPTION
      'Se esperaban exactamente 2 torres actuales (Torre A y Torre B); se encontraron %. No se modificó nada.',
      v_tower_count;
  END IF;

  SELECT id INTO v_tower_a_id
  FROM public.towers
  WHERE tenant_id = v_tenant_id
    AND trim(name) = 'Torre A';

  SELECT id INTO v_tower_b_id
  FROM public.towers
  WHERE tenant_id = v_tenant_id
    AND trim(name) = 'Torre B';

  IF v_tower_a_id IS NULL OR v_tower_b_id IS NULL THEN
    RAISE EXCEPTION 'No se identificaron exactamente Torre A y Torre B. Revisar nombres antes de continuar.';
  END IF;

  SELECT count(*)
  INTO v_unit_count
  FROM public.units u
  WHERE u.tower_id IN (v_tower_a_id, v_tower_b_id);

  IF v_unit_count <> 54 THEN
    RAISE EXCEPTION
      'Se esperaban 54 unidades entre Torre A y Torre B; se encontraron %. No se modificó nada.',
      v_unit_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.units
    WHERE tower_id IN (v_tower_a_id, v_tower_b_id)
      AND code !~ '^[1-3]0[1-9]$'
  ) THEN
    RAISE EXCEPTION 'Hay códigos o pisos de origen inesperados. No se modificó nada.';
  END IF;

  -- Guardar una correspondencia estable entre los 54 UUID y sus nuevas ubicaciones.
  CREATE TEMP TABLE _terrazze_unit_map ON COMMIT DROP AS
  SELECT
    u.id AS unit_id,
    row_number() OVER (
      ORDER BY u.floor, tw.name, u.code
    )::integer AS sequence_no
  FROM public.units u
  JOIN public.towers tw ON tw.id = u.tower_id
  WHERE tw.tenant_id = v_tenant_id;

  IF (SELECT count(*) FROM _terrazze_unit_map) <> 54 THEN
    RAISE EXCEPTION 'El mapa de reorganización no contiene exactamente 54 unidades.';
  END IF;

  -- Cambiar temporalmente los códigos para evitar colisiones con restricciones únicas.
  UPDATE public.units u
  SET code = 'TMP' || substr(replace(u.id::text, '-', ''), 1, 8)
  WHERE u.id IN (SELECT unit_id FROM _terrazze_unit_map);

  -- Consolidar las 54 unidades en Torre A, que pasará a llamarse Torre 1.
  UPDATE public.units u
  SET
    tower_id = v_tower_a_id,
    floor = ((m.sequence_no - 1) / 6) + 1,
    code = (
      (((m.sequence_no - 1) / 6) + 1) * 100
      + ((m.sequence_no - 1) % 6) + 1
    )::text
  FROM _terrazze_unit_map m
  WHERE u.id = m.unit_id;

  UPDATE public.towers
  SET name = 'Torre 1'
  WHERE id = v_tower_a_id;

  -- Verificar que todas las unidades quedaron en la torre única y en el patrón esperado.
  SELECT count(*)
  INTO v_unit_count
  FROM public.units
  WHERE tower_id = v_tower_a_id;

  IF v_unit_count <> 54 THEN
    RAISE EXCEPTION 'Después de reorganizar se encontraron % unidades en Torre 1, no 54.', v_unit_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.units
    WHERE tower_id = v_tower_a_id
      AND (
        code !~ '^[1-9]0[1-6]$'
        OR floor <> left(code, 1)::integer
      )
  ) THEN
    RAISE EXCEPTION 'La validación de códigos o pisos falló. Se revierte toda la operación.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT floor, count(*) AS total
      FROM public.units
      WHERE tower_id = v_tower_a_id
      GROUP BY floor
    ) floors
    WHERE total <> 6
  ) OR (
    SELECT count(DISTINCT floor)
    FROM public.units
    WHERE tower_id = v_tower_a_id
  ) <> 9 THEN
    RAISE EXCEPTION 'La distribución no quedó en nueve pisos con seis apartamentos cada uno.';
  END IF;

  -- Antes de borrar Torre B, comprobar que ninguna otra tabla la referencia.
  -- Se detiene ante claves foráneas compuestas para exigir revisión manual.
  FOR fk IN
    SELECT
      c.conrelid::regclass AS referencing_table,
      a.attname AS referencing_column,
      c.conname AS constraint_name,
      cardinality(c.conkey) AS key_columns
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.towers'::regclass
  LOOP
    IF fk.key_columns <> 1 THEN
      RAISE EXCEPTION
        'La FK % de % es compuesta. No se elimina Torre B sin revisión manual.',
        fk.constraint_name, fk.referencing_table;
    END IF;

    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)',
      fk.referencing_table,
      fk.referencing_column
    )
    INTO v_has_refs
    USING v_tower_b_id;

    IF v_has_refs THEN
      RAISE EXCEPTION
        'La tabla % aún contiene referencias a Torre B mediante %. Se revierte todo.',
        fk.referencing_table, fk.referencing_column;
    END IF;
  END LOOP;

  DELETE FROM public.towers
  WHERE id = v_tower_b_id;

  UPDATE public.tenants
  SET housing_model = 'apartments'
  WHERE id = v_tenant_id;
END;
$$;

-- Resumen de validación: debe devolver una sola fila, Torre 1, 54 apartamentos,
-- piso mínimo 1 y piso máximo 9.
SELECT
  t.id AS tower_id,
  t.name AS torre,
  count(u.id) AS apartamentos,
  count(DISTINCT u.floor) AS pisos,
  min(u.floor) AS piso_minimo,
  max(u.floor) AS piso_maximo
FROM public.towers t
LEFT JOIN public.units u ON u.tower_id = t.id
WHERE t.tenant_id = 'd8c7c4e1-7511-44d3-8b4b-65ea5608a2f7'
GROUP BY t.id, t.name;

COMMIT;
