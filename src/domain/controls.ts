import { DomainError } from './types';
import type { Control, ControlSeverity } from './types';

export const CONTROL_SET_VERSION = '1.0';

const c = (id: string, name: string, severity: ControlSeverity): Control => ({
  id,
  name,
  severity,
  domain: id.split('-')[0],
});

export const CONTROLS: Control[] = [
  c('AA-1', 'Agent owner named', 'important'),
  c('AA-2', 'Purpose documented', 'important'),
  c('PE-1', 'Permission scoping per tool', 'critical'),
  c('PE-2', 'Human approval for irreversible actions', 'critical'),
  c('LA-1', 'Least agency for tools', 'critical'),
  c('LA-2', 'Tool & API allowlist', 'critical'),
  c('LA-3', 'Transaction and rate limits', 'critical'),
  c('RO-1', 'Error handling and fallback', 'important'),
  c('RO-4', 'Tested stop mechanism', 'critical'),
  c('MS-1', 'Agent memory policy', 'important'),
  c('MS-2', 'Data minimisation', 'important'),
  c('AE-1', 'Action audit trail', 'important'),
  c('AE-2', 'Output monitoring', 'important'),
  c('CA-1', 'Reauthorisation on change', 'important'),
  c('CA-2', 'Change log kept', 'important'),
];

export function getControl(id: string): Control {
  const found = CONTROLS.find((x) => x.id === id);
  if (!found) throw new DomainError('UNKNOWN_CONTROL', `Unknown control ${id}`);
  return found;
}

export function controlOrder(id: string): number {
  return CONTROLS.findIndex((x) => x.id === id);
}
