export type HousingModel = 'houses' | 'apartments' | 'units';

export type HousingConfig = {
  model: HousingModel;
  singular: string;
  plural: string;
  article: string;
};

export function getHousingConfig(model?: string | null): HousingConfig {
  if (model === 'houses') {
    return {
      model: 'houses',
      singular: 'Casa',
      plural: 'Casas',
      article: 'casa',
    };
  }

  if (model === 'apartments') {
    return {
      model: 'apartments',
      singular: 'Apartamento',
      plural: 'Apartamentos',
      article: 'apartamento',
    };
  }

  return {
    model: 'units',
    singular: 'Vivienda',
    plural: 'Viviendas',
    article: 'vivienda',
  };
}

export function formatUnitLabel(
  code?: string | null,
  towerName?: string | null,
  model?: string | null
): string {
  const config = getHousingConfig(model);
  const unitCode = String(code ?? '').trim();

  if (!unitCode) return config.singular;

  const unitLabel = `${config.singular} ${unitCode}`;

  if (config.model === 'houses' || !towerName) {
    return unitLabel;
  }

  return `${towerName} · ${unitLabel}`;
}
