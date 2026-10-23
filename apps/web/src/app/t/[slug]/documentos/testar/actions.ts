'use server';

import { z } from 'zod';
import { api } from '@/lib/api';
import { formText } from '@/lib/form';
import { getTenantContext } from '@/lib/tenant-context';

export type TestSource = {
  chunk_id: string;
  title: string;
  code: string | null;
  section: string | null;
  page: number | null;
  version: string | null;
  similarity: number | null;
  text: string;
  cited: boolean;
};

export type TestState =
  | undefined
  | { error: string }
  | {
      question: string;
      outcome: 'answered' | 'handoff' | 'error';
      answer: string | null;
      handoffReason: string | null;
      sources: TestSource[];
      costUsd: number;
    };

/** Asks the base through the same search and citation rule the WhatsApp agents use. */
export async function askBase(_prev: TestState, formData: FormData): Promise<TestState> {
  const slug = z.string().min(1).parse(formData.get('slug'));
  const { tenant } = await getTenantContext(slug);
  const question = formText(formData, 'question').trim();
  if (question.length < 3) return { error: 'Escreva a pergunta.' };
  const collections = formData
    .getAll('collections')
    .filter((c): c is string => typeof c === 'string');
  const result = await api<{
    outcome: 'answered' | 'handoff' | 'error';
    answer: string | null;
    handoff_reason: string | null;
    sources: TestSource[];
    cost_usd: number;
  }>('/v1/knowledge/test', {
    method: 'POST',
    tenantId: tenant.id,
    body: { question, ...(collections.length ? { collections } : {}) },
  });
  if (!result.ok) return { error: result.message };
  return {
    question,
    outcome: result.data.outcome,
    answer: result.data.answer,
    handoffReason: result.data.handoff_reason,
    sources: result.data.sources,
    costUsd: result.data.cost_usd,
  };
}
