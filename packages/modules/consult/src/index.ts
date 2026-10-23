import { defineModule } from '@nurion/core';

/** Agent keys follow ESCOPO §4.4 ('log.driver', 'labs.patient', 'consult.copilot', 'adm.requests'). */
export const consultModule = defineModule({
  key: 'consult',
  label: 'Nurion Consult',
  agentFor: (kind) => (kind === 'staff' ? 'consult.copilot' : undefined),
});
