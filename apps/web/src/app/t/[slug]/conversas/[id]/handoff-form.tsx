'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { closeHandoff } from './actions';

export function CloseHandoffForm({
  slug,
  conversationId,
}: {
  slug: string;
  conversationId: string;
}) {
  const [state, action] = useActionState(closeHandoff, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="conversation_id" value={conversationId} />
      <FormMessage state={state} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Encerrando…">
        Encerrar atendimento humano
      </SubmitButton>
    </form>
  );
}
