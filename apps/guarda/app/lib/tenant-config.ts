export type HousingModel = 'houses' | 'apartments' | 'units';

export type HousingConfig = {
  model: HousingModel;
  singular: string;
  plural: string;
  article: string;
  searchLabel: string;
  searchPlaceholder: string;
};

export const TENANT_HOUSING_MODELS: Record<string, HousingModel> = {
  '4888dce4-b74a-491f-b7d6-f2d903f2fe30': 'houses',
  '8c6f4e21-7d3a-4b91-9f25-6a2d8c0e51b7': 'apartments',
};

const HOUSING_CONFIGS: Record<HousingModel, HousingConfig> = {
  houses: {
    model: 'houses',
    singular: 'Casa',
    plural: 'Casas',
    article: 'la',
    searchLabel: 'Número de casa',
    searchPlaceholder: 'Ej. 24',
  },
  apartments: {
    model: 'apartments',
    singular: 'Apartamento',
    plural: 'Apartamentos',
    article: 'el',
    searchLabel: 'Número de apartamento',
    searchPlaceholder: 'Ej. 204',
  },
  units: {
    model: 'units',
    singular: 'Unidad',
    plural: 'Unidades',
    article: 'la',
    searchLabel: 'Número de unidad',
    searchPlaceholder: 'Ej. 24',
  },
};

export function getHousingConfig(value?: string | null): HousingConfig {
  if (value === 'houses' || value === 'apartments' || value === 'units') {
    return HOUSING_CONFIGS[value];
  }

  const model = value ? TENANT_HOUSING_MODELS[value] : undefined;
  return HOUSING_CONFIGS[model ?? 'units'];
}

function cleanUnitCode(code: string): string {
  return code
    .trim()
    .replace(/^(casa|apartamento|apto|unidad)\s*/i, '')
    .trim();
}

export function formatUnitLabel(
  code: string,
  tower?: string | null,
  housingModel?: string | null
): string {
  const config = getHousingConfig(housingModel);
  const cleanCode = cleanUnitCode(code);

  if (config.model === 'apartments') {
    return tower
      ? `Torre ${tower} · Apartamento ${cleanCode}`
      : `Apartamento ${cleanCode}`;
  }

  if (config.model === 'houses') {
    return `Casa ${cleanCode}`;
  }

  return tower
    ? `Torre ${tower} · Unidad ${cleanCode}`
    : `Unidad ${cleanCode}`;
}

export function formatTowerLabel(value: string | null | undefined): string {
  const name = (value ?? '').trim();
  if (!name) return 'Torre';
  return /^torre\b/i.test(name) ? name : `Torre ${name}`;
}
