import { describe, expect, it } from 'vitest';
import { routeConversation, type RouteInput } from './router';

const base: RouteInput = {
  contactKind: 'unknown',
  enabledModules: ['log', 'labs', 'consult', 'adm'],
  numberDefaultModule: null,
  stickyModule: null,
  handoffOpen: false,
};
const route = (patch: Partial<RouteInput>) => routeConversation({ ...base, ...patch });

describe('routeConversation (ESCOPO §4.3)', () => {
  it('an open handoff always goes to the human inbox, never to the AI', () => {
    for (const contactKind of ['driver', 'patient', 'staff', 'unknown'] as const) {
      expect(route({ contactKind, handoffOpen: true })).toEqual({ action: 'human' });
    }
  });

  it('drivers go to Log, patients to Labs — when the module is contracted', () => {
    expect(route({ contactKind: 'driver' })).toMatchObject({ action: 'agent', module: 'log' });
    expect(route({ contactKind: 'patient' })).toMatchObject({ action: 'agent', module: 'labs' });
    expect(route({ contactKind: 'driver', enabledModules: ['labs'] })).toEqual({
      action: 'no_module',
    });
  });

  it('unknown contacts: number default, else Labs on a lab tenant, else identification + human', () => {
    expect(route({ numberDefaultModule: 'log' })).toMatchObject({
      module: 'log',
      reason: 'number_default',
    });
    expect(route({ enabledModules: ['labs', 'consult'] })).toMatchObject({
      module: 'labs',
      reason: 'lab_number',
    });
    expect(route({ enabledModules: ['log', 'adm'] })).toEqual({ action: 'unidentified' });
    expect(route({ enabledModules: ['log'], numberDefaultModule: 'labs' })).toEqual({
      action: 'unidentified',
    });
  });

  it('staff: number default, then the sticky module, then the only module', () => {
    expect(route({ contactKind: 'staff', numberDefaultModule: 'adm' })).toMatchObject({
      module: 'adm',
    });
    expect(route({ contactKind: 'staff', stickyModule: 'consult' })).toMatchObject({
      module: 'consult',
      reason: 'sticky',
    });
    expect(route({ contactKind: 'staff', enabledModules: ['consult'] })).toMatchObject({
      module: 'consult',
    });
  });

  it('staff with several modules: classify, accept a confident answer, otherwise ask', () => {
    expect(route({ contactKind: 'staff' })).toEqual({
      action: 'classify',
      candidates: base.enabledModules,
    });
    expect(
      route({ contactKind: 'staff', staffIntent: { module: 'adm', confidence: 0.92 } }),
    ).toMatchObject({
      module: 'adm',
      reason: 'classifier',
    });
    expect(
      route({ contactKind: 'staff', staffIntent: { module: 'adm', confidence: 0.4 } }),
    ).toMatchObject({
      action: 'ask_module',
    });
    expect(route({ contactKind: 'staff', staffIntent: null })).toMatchObject({
      action: 'ask_module',
    });
    expect(
      route({
        contactKind: 'staff',
        enabledModules: ['consult', 'adm'],
        staffIntent: { module: 'log', confidence: 0.99 },
      }),
    ).toMatchObject({ action: 'ask_module' });
  });

  it('a module picked from our list wins, if contracted', () => {
    expect(route({ contactKind: 'staff', moduleChoice: 'consult' })).toMatchObject({
      module: 'consult',
      reason: 'contact_choice',
    });
    expect(
      route({ contactKind: 'staff', moduleChoice: 'log', enabledModules: ['consult', 'adm'] }),
    ).toMatchObject({
      action: 'classify',
    });
  });

  it('nothing contracted means no automatic answer', () => {
    expect(route({ contactKind: 'staff', enabledModules: [] })).toEqual({ action: 'no_module' });
  });
});
