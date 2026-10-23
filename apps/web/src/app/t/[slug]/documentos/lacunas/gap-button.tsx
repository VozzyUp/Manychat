'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { setGapStatus } from './actions';

export function GapButton({
  slug,
  gapId,
  to,
}: {
  slug: string;
  gapId: string;
  to: 'open' | 'resolved';
}) {
  const [state, action] = useActionState(setGapStatus, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="gap_id" value={gapId} />
      <input type="hidden" name="status" value={to} />
      <SubmitButton variant="secondary" size="sm">
        {to === 'resolved' ? 'Marcar como resolvida' : 'Reabrir'}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
