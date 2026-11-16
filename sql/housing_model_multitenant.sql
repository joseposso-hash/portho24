-- Portho24: modelo de vivienda por conjunto
-- Migración para clasificación multi-tenant.
-- Ejecutar una sola vez en Supabase; no modifica usuarios ni unidades.

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
END;
$$;

-- Pinar de la Fontana E3: conservar modelo de casas.
UPDATE public.tenants
SET housing_model = 'houses'
WHERE id = '4888dce4-b74a-491f-b7d6-f2d903f2fe30';

-- Santa Coloma: apartamentos.
UPDATE public.tenants
SET housing_model = 'apartments'
WHERE id = '8c6f4e21-7d3a-4b91-9f25-6a2d8c0e51b7';

-- Terrazze 187: apartamentos.
UPDATE public.tenants
SET housing_model = 'apartments'
WHERE id = 'd8c7c4e1-7511-44d3-8b4b-65ea5608a2f7';

COMMENT ON COLUMN public.tenants.housing_model IS
'Modelo de vivienda del conjunto: houses o apartments. NULL indica pendiente de clasificación.';
