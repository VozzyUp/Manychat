import type { ContactKind, ModuleKey } from '@nurion/shared';

export type RouteInput = {
  contactKind: ContactKind;
  enabledModules: ModuleKey[];
  numberDefaultModule: ModuleKey | null;
  /** Module chosen earlier in this conversation, while its state has not expired. */
  stickyModule: ModuleKey | null;
  handoffOpen: boolean;
  /** The contact picked a module from the list we sent ("module:<key>"). */
  moduleChoice?: ModuleKey | null;
  /** Result of the fast classifier for staff, when it ran. */
  staffIntent?: { module: ModuleKey; confidence: number } | null;
};

export type RouteDecision =
  | { action: 'human' }
  | { action: 'agent'; module: ModuleKey; reason: string }
  | { action: 'classify'; candidates: ModuleKey[] }
  | { action: 'ask_module'; candidates: ModuleKey[] }
  | { action: 'unidentified' }
  | { action: 'no_module' };

/** Below this the classifier's answer is not trusted and the contact is asked (list of modules). */
export const STAFF_INTENT_MIN_CONFIDENCE = 0.7;

/**
 * Who answers this conversation (ESCOPO §4.3). Pure function: the turn processor gathers the
 * inputs, runs the classifier when asked to, and acts on the decision.
 */
export function routeConversation(input: RouteInput): RouteDecision {
  const enabled = new Set(input.enabledModules);
  const pick = (module: ModuleKey | null | undefined) =>
    module && enabled.has(module) ? module : null;

  if (input.handoffOpen) return { action: 'human' };

  const chosen = pick(input.moduleChoice);
  if (chosen) return { action: 'agent', module: chosen, reason: 'contact_choice' };

  switch (input.contactKind) {
    case 'driver':
      return enabled.has('log')
        ? { action: 'agent', module: 'log', reason: 'driver' }
        : { action: 'no_module' };

    case 'patient':
      return enabled.has('labs')
        ? { action: 'agent', module: 'labs', reason: 'patient' }
        : { action: 'no_module' };

    case 'unknown': {
      const byNumber = pick(input.numberDefaultModule);
      if (byNumber) return { action: 'agent', module: byNumber, reason: 'number_default' };
      // "patient / unknown em número de laboratório → agente do Labs"
      if (enabled.has('labs')) return { action: 'agent', module: 'labs', reason: 'lab_number' };
      return { action: 'unidentified' };
    }

    case 'staff': {
      const candidates = input.enabledModules;
      if (!candidates.length) return { action: 'no_module' };
      const byNumber = pick(input.numberDefaultModule);
      if (byNumber) return { action: 'agent', module: byNumber, reason: 'number_default' };
      const sticky = pick(input.stickyModule);
      if (sticky) return { action: 'agent', module: sticky, reason: 'sticky' };
      if (candidates.length === 1)
        return { action: 'agent', module: candidates[0]!, reason: 'only_module' };
      if (input.staffIntent === undefined) return { action: 'classify', candidates };
      const intent = input.staffIntent;
      if (
        intent &&
        enabled.has(intent.module) &&
        intent.confidence >= STAFF_INTENT_MIN_CONFIDENCE
      ) {
        return { action: 'agent', module: intent.module, reason: 'classifier' };
      }
      return { action: 'ask_module', candidates };
    }
  }
}
