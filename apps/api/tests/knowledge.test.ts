import { afterAll, beforeAll, expect, it } from 'vitest';
import { as, buildTestApp } from './helpers/app';
import { createUser, describeStack, signIn, sql } from './helpers/stack';
import { createApiWorld, type ApiWorld } from './helpers/world';

describeStack('Testar a base and unanswered questions', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let w: ApiWorld;
  let manager: string;
  let quality: string;
  const asked: { tenantId: string; question: string; collections?: string[] }[] = [];

  beforeAll(async () => {
    app = await buildTestApp({
      knowledgeTest: async (input) => {
        asked.push(input);
        return {
          runId: 'run-1',
          outcome: 'answered',
          answer: 'Entre 2 e 8 °C.\n\n📄 Fonte: POP-012, 4.2 (v3)',
          sources: [
            {
              chunkId: 'c1',
              title: 'POP-012',
              section: '4.2',
              version: '3',
              page: 2,
              similarity: 0.82,
              text: 'Manter entre 2 e 8 °C.',
              cited: true,
            },
            { chunkId: 'c2', title: 'Manual', version: '1', text: 'Outro trecho', cited: false },
          ],
          costUsd: 0.0123,
          turns: 2,
        };
      },
    });
    w = await createApiWorld();
    const [m, q] = await Promise.all([createUser('gestor'), createUser('qualidade')]);
    await sql(
      `insert into tenant_members (tenant_id, user_id, role) values ($1, $2, 'manager'), ($1, $3, 'quality')`,
      [w.tenants.A, m.id, q.id],
    );
    w.extraUserIds.push(m.id, q.id);
    manager = await signIn(m.email);
    quality = await signIn(q.email);
  }, 60_000);
  afterAll(async () => {
    await w?.cleanup();
    await app?.close();
  });

  const test = (token: string, payload: Record<string, unknown>, tenant = w.tenants.A) =>
    app.inject({ method: 'POST', url: '/v1/knowledge/test', headers: as(token, tenant), payload });

  it('a manager asks the base: answer, sources with the cited ones marked, cost', async () => {
    const res = await test(manager, {
      question: 'Qual a temperatura da câmara?',
      collections: ['pop'],
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      outcome: 'answered',
      answer: expect.stringContaining('📄 Fonte'),
      handoff_reason: null,
      cost_usd: 0.0123,
      sources: [
        {
          chunk_id: 'c1',
          title: 'POP-012',
          section: '4.2',
          page: 2,
          version: '3',
          similarity: 0.82,
          cited: true,
        },
        { chunk_id: 'c2', code: null, section: null, page: null, cited: false },
      ],
    });
    expect(asked.at(-1)).toEqual({
      tenantId: w.tenants.A,
      question: 'Qual a temperatura da câmara?',
      collections: ['pop'],
    });
  });

  it('needs manager or above and a valid question; collections must be known', async () => {
    expect((await test(quality, { question: 'Qual a regra?' })).statusCode).toBe(403);
    expect((await test(w.tokens.viewer, { question: 'Qual a regra?' })).statusCode).toBe(403);
    expect((await test(w.tokens.outsider, { question: 'Qual a regra?' })).statusCode).toBe(403);
    expect((await test(manager, { question: 'a' })).statusCode).toBe(400);
    expect(
      (await test(manager, { question: 'Qual a regra?', collections: ['receita'] })).statusCode,
    ).toBe(400);
    const before = asked.length;
    expect((await test(w.tokens.admin, { question: 'Qual a regra da empresa?' })).statusCode).toBe(
      200,
    );
    expect(asked.length).toBe(before + 1);
  });

  it('answers 503 with a clear message when the AI or embeddings are not configured', async () => {
    const bare = await buildTestApp({ knowledgeTest: null });
    try {
      const res = await bare.inject({
        method: 'POST',
        url: '/v1/knowledge/test',
        headers: as(manager, w.tenants.A),
        payload: { question: 'Qual a regra?' },
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.message).toContain('não estão configurados');
    } finally {
      await bare.close();
    }
  });

  it('quality marks a gap resolved and can reopen it; others and other tenants cannot', async () => {
    const [gap] = await sql<{ id: string }>(
      `insert into knowledge_gaps (tenant_id, question, reason) values ($1, 'Qual o prazo do reagente?', 'no_knowledge') returning id`,
      [w.tenants.A],
    );
    const url = `/v1/knowledge-gaps/${gap!.id}`;
    const patch = (token: string, status: string, tenant = w.tenants.A) =>
      app.inject({ method: 'PATCH', url, headers: as(token, tenant), payload: { status } });

    expect((await patch(w.tokens.viewer, 'resolved')).statusCode).toBe(403);
    const ok = await patch(quality, 'resolved');
    expect(ok.json()).toMatchObject({ status: 'resolved' });
    expect(ok.json().resolved_at).toBeTruthy();
    const [row] = await sql<{ resolved_by: string | null }>(
      `select resolved_by from knowledge_gaps where id = $1`,
      [gap!.id],
    );
    expect(row!.resolved_by).toBeTruthy();
    expect((await patch(quality, 'open')).json()).toMatchObject({
      status: 'open',
      resolved_at: null,
    });
    expect((await patch(w.tokens.ownerB, 'resolved', w.tenants.B)).statusCode).toBe(404);
    expect((await patch(quality, 'bogus')).statusCode).toBe(400);
  });
});
