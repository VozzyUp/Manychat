import { defineModule } from '@nurion/core';

/** Agent keys follow ESCOPO §4.4 ('log.driver', 'labs.patient', 'consult.copilot', 'adm.requests'). */
export const logModule = defineModule({
  key: 'log',
  label: 'Nurion Log',
  agentFor: (kind) => (kind === 'driver' ? 'log.driver' : undefined),
});
