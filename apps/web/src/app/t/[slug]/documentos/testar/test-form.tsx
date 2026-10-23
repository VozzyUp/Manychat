'use client';

import { COLLECTIONS } from '@nurion/shared/domain';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { TextAreaField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { COLLECTION_LABELS, HANDOFF_TEST_LABELS } from '@/lib/labels';
import { askBase } from './actions';

export function TestForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(askBase, undefined);
  return (
    <div className="space-y-6">
      <Card>
        <form action={action} className="space-y-4">
          <input type="hidden" name="slug" value={slug} />
          <TextAreaField
            id="question"
            label="Pergunta"
            required
            maxLength={500}
            placeholder="Qual a temperatura da caixa térmica no transporte de amostras?"
            hint="A IA responde só com o que está nos documentos aprovados e processados, e cita a fonte."
          />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-text">Coleções consultadas</legend>
            <p className="text-sm text-muted">Nenhuma marcada = todas.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {COLLECTIONS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-text">
                  <input type="checkbox" name="collections" value={c} />
                  {COLLECTION_LABELS[c]}
                </label>
              ))}
            </div>
          </fieldset>
          {state && 'error' in state ? <Alert tone="error">{state.error}</Alert> : null}
          <SubmitButton pendingLabel="Consultando a base…">Perguntar</SubmitButton>
        </form>
      </Card>

      {state && 'outcome' in state ? (
        <>
          <Card>
            <CardTitle description={`Pergunta: ${state.question}`}>Resposta</CardTitle>
            {state.outcome === 'answered' ? (
              <p className="whitespace-pre-wrap text-sm text-text">{state.answer}</p>
            ) : (
              <div className="space-y-2">
                <Alert tone="warning">
                  Sem resposta: no WhatsApp, a conversa iria para uma pessoa da equipe.
                </Alert>
                <p className="text-sm text-muted">
                  {HANDOFF_TEST_LABELS[state.handoffReason ?? 'other'] ?? HANDOFF_TEST_LABELS.other}
                </p>
              </div>
            )}
            {state.costUsd > 0 ? (
              <p className="mt-3 text-xs text-muted">
                Custo desta consulta: US$ {state.costUsd.toFixed(4)}
              </p>
            ) : null}
          </Card>
          <Card>
            <CardTitle description="Trechos que a busca devolveu, do mais ao menos relevante.">
              Trechos encontrados ({state.sources.length})
            </CardTitle>
            {state.sources.length ? (
              <ul className="space-y-3" aria-label="Trechos encontrados">
                {state.sources.map((s) => (
                  <li key={s.chunk_id} className="rounded-md border border-border p-3">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-text">
                        {s.code ? `${s.code} · ` : ''}
                        {s.title}
                        {s.section ? `, ${s.section}` : ''}
                        {s.version ? ` (v${s.version})` : ''}
                        {s.page ? ` · p. ${s.page}` : ''}
                      </p>
                      <span className="flex items-center gap-2">
                        {s.similarity !== null ? (
                          <span className="text-xs text-muted">
                            relevância {(s.similarity * 100).toFixed(0)}%
                          </span>
                        ) : null}
                        {s.cited ? (
                          <Badge tone="success">Usado na resposta</Badge>
                        ) : (
                          <Badge>Não usado</Badge>
                        )}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-text">{s.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                Nenhum trecho passou do limiar de relevância. Confira se o documento está aprovado e
                processado (&quot;Em uso pela IA&quot;).
              </p>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
