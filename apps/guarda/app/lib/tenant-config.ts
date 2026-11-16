export type HousingModel = 'houses' | 'apartments' | 'units';

const PINAR_TENANT_ID = '4888dce4-b74a-491f-b7d6-f2d903f2fe30';
const SANTA_COLOMA_TENANT_ID = '8c6f4e21-7d3a-4b91-9f25-6a2d8c0e51b7';

export function resolveHousingModel(
  tenantId?: string | null,
  configuredModel?: string | null
): HousingModel {
  if (tenantId === PINAR_TENANT_ID) return 'houses';
  if (tenantId === SANTA_COLOMA_TENANT_ID) return 'apartments';
  if (configuredModel === 'houses' || configuredModel === 'apartments' || configuredModel === 'units') {
    return configuredModel;
  }
  return 'units';
}

export function formatTowerLabel(towerName?: string | null): string {
  const name = String(towerName ?? '').trim();
  if (!name) return '';
  if (/^torre\b/i.test(name)) return name;
  return /^\d+$/.test(name) ? `Torre ${name}` : name;
}

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

  return `${formatTowerLabel(towerName)} · ${unitLabel}`;
}
