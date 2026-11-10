export function getHouseNumber(code: string | null | undefined): string {
  const match = String(code ?? '').match(/(\d+)\s*$/);
  if (!match) return '';

  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number > 0 ? String(number) : '';
}
