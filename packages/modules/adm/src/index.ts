import { defineModule } from '@nurion/core';

/** Agent keys follow ESCOPO §4.4 ('log.driver', 'labs.patient', 'consult.copilot', 'adm.requests'). */
export const admModule = defineModule({
  key: 'adm',
  label: 'Nurion ADM Health',
  agentFor: (kind) => (kind === 'staff' ? 'adm.requests' : undefined),
});
