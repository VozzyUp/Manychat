import type { ModuleKey } from '@nurion/shared';

/**
 * What a product module contributes to the platform. Modules register themselves here;
 * the core never imports a module by name (ESCOPO §3).
 * Agents, tools, jobs and routes are added to this type as the build steps land.
 */
export type ModuleDefinition = {
  key: ModuleKey;
  /** Display name in the panel (pt-BR). */
  label: string;
};

export function defineModule(definition: ModuleDefinition): ModuleDefinition {
  return definition;
}

export class ModuleRegistry {
  private readonly modules = new Map<ModuleKey, ModuleDefinition>();

  register(definition: ModuleDefinition): this {
    if (this.modules.has(definition.key)) {
      throw new Error(`Module already registered: ${definition.key}`);
    }
    this.modules.set(definition.key, definition);
    return this;
  }

  get(key: ModuleKey): ModuleDefinition | undefined {
    return this.modules.get(key);
  }

  list(): ModuleDefinition[] {
    return [...this.modules.values()];
  }
}
