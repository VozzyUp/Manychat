import { defineModule } from '@nurion/core';

/** Agent keys follow ESCOPO §4.4 ('log.driver', 'labs.patient', 'consult.copilot', 'adm.requests'). */
export const labsModule = defineModule({
  key: 'labs',
  label: 'Nurion Labs',
  agentFor: (kind) => (kind === 'staff' ? 'labs.staff' : 'labs.patient'),
});
