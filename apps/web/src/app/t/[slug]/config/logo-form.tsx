'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { removeLogo, uploadLogo } from './actions';

export function LogoForm({
  slug,
  logoUrl,
  canEdit,
}: {
  slug: string;
  logoUrl: string | null;
  canEdit: boolean;
}) {
  const [uploadState, upload] = useActionState(uploadLogo, undefined);
  const [removeState, remove] = useActionState(removeLogo, undefined);
  return (
    <div className="space-y-4">
      <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border bg-surface">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo atual" className="max-h-16 max-w-48 object-contain" />
        ) : (
          <span className="text-sm text-muted">Sem logo</span>
        )}
      </div>
      {canEdit ? (
        <>
          <form action={upload} className="space-y-3">
            <input type="hidden" name="slug" value={slug} />
            <label htmlFor="logo" className="block text-sm font-medium text-text">
              Novo logo (PNG, JPG ou WEBP, até 1 MB)
            </label>
            <input
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-strong file:px-3 file:py-2 file:text-sm file:font-medium"
            />
            <SubmitButton variant="secondary" pendingLabel="Enviando…">
              Enviar logo
            </SubmitButton>
            <FormMessage state={uploadState} />
          </form>
          {logoUrl ? (
            <form action={remove}>
              <input type="hidden" name="slug" value={slug} />
              <SubmitButton variant="ghost" size="sm" pendingLabel="Removendo…">
                Remover logo
              </SubmitButton>
              <FormMessage state={removeState} />
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
