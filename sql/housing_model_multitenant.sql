-- Portho24: modelo de vivienda por conjunto
-- Migracion idempotente. Preparada para ejecutar una sola vez por ambiente.
-- No crea conjuntos ni viviendas; la clasificacion de Santa Coloma se realiza
-- cuando exista su tenant_id confirmado.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS housing_model text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_housing_model_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_housing_model_check
      CHECK (
        housing_model IS NULL
        OR housing_model IN ('houses', 'apartments')
      );
  END IF;
END
$$;

-- Clasificacion explicita del conjunto existente. No modifica sus viviendas,
-- usuarios ni registros operativos.
UPDATE public.tenants
SET housing_model = 'houses'
WHERE id = '4888dce4-b74a-491f-b7d6-f2d903f2fe30'
  AND housing_model IS DISTINCT FROM 'houses';

COMMENT ON COLUMN public.tenants.housing_model IS
  'Modelo de vivienda del conjunto: houses o apartments. NULL indica pendiente de clasificacion.';
