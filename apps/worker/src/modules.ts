import { ModuleRegistry } from '@nurion/core';
import { admModule } from '@nurion/module-adm';
import { consultModule } from '@nurion/module-consult';
import { labsModule } from '@nurion/module-labs';
import { logModule } from '@nurion/module-log';

/** The worker runs every module; each tenant only reaches the ones it has enabled. */
export const buildRegistry = (): ModuleRegistry =>
  new ModuleRegistry()
    .register(logModule)
    .register(labsModule)
    .register(consultModule)
    .register(admModule);
