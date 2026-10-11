import type { TribunalCapability } from './contracts';
export function canSearchCourt(capabilities: TribunalCapability[], court: string): boolean {
  return capabilities.some(item => item.code === court && item.searchable);
}
