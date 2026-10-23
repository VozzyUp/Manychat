import type { ContactKind, ModuleKey } from '@nurion/shared';
import type { AgentDefinition } from './agents/types';

/**
 * What a product module contributes to the platform. Modules register themselves here;
 * the core never imports a module by name (ESCOPO §3).
 * Agents, tools, jobs and routes are added to this type as the build steps land.
 */
export type ModuleDefinition = {
  key: ModuleKey;
  /** Display name in the panel (pt-BR). */
  label: string;
  /** Agent that talks to this kind of contact in this module (e.g. driver → 'log.driver'). */
  agentFor?: (kind: ContactKind) => string | undefined;
  /** Agents of this module (ESCOPO §4.4). */
  agents?: AgentDefinition[];
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

  /** Agent by key ('log.driver'), from whichever module defines it. */
  agent(key: string): AgentDefinition | undefined {
    for (const m of this.modules.values()) {
      const found = m.agents?.find((a) => a.key === key);
      if (found) return found;
    }
    return undefined;
  }

  list(): ModuleDefinition[] {
    return [...this.modules.values()];
  }
}
