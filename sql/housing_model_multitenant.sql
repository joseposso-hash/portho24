-- Portho24: modelo de vivienda por conjunto
-- Migracion local. Pendiente de aprobacion antes de ejecutar en Supabase.

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS housing_model text;

ALTER TABLE public.tenants
ADD CONSTRAINT tenants_housing_model_check
CHECK (
  housing_model IS NULL
  OR housing_model IN ('houses', 'apartments')
);

-- Pinar de la Fontana E3: conservar su modelo actual de casas.
UPDATE public.tenants
SET housing_model = 'houses'
WHERE id = '4888dce4-b74a-491f-b7d6-f2d903f2fe30'
  AND housing_model IS NULL;

COMMENT ON COLUMN public.tenants.housing_model IS
'Modelo de vivienda del conjunto: houses o apartments. NULL indica pendiente de clasificacion.';
