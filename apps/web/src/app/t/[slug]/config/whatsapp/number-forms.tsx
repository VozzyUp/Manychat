'use client';

import type { ModuleKey } from '@nurion/shared/domain';
import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { SelectField, TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { MODULE_LABELS } from '@/lib/labels';
import { addNumber, deleteNumber, updateNumber } from './actions';

export type NumberView = {
  id: string;
  display_number: string;
  phone_number_id: string;
  waba_id: string;
  verified_name: string | null;
  verified_at: string | null;
  status: string;
  default_module: string | null;
  token_last4: string;
};

function ModuleOptions({ modules }: { modules: ModuleKey[] }) {
  return (
    <>
      <option value="">Decidir pelo tipo de contato</option>
      {modules.map((m) => (
        <option key={m} value={m}>
          {MODULE_LABELS[m]}
        </option>
      ))}
    </>
  );
}

export function AddNumberForm({ slug, modules }: { slug: string; modules: ModuleKey[] }) {
  const [state, action] = useActionState(addNumber, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="slug" value={slug} />
      <TextField
        id="phone_number_id"
        label="Phone number ID"
        inputMode="numeric"
        required
        hint="No Meta Business: WhatsApp → Configuração da API."
      />
      <TextField id="waba_id" label="WhatsApp Business Account ID" inputMode="numeric" required />
      <TextField
        id="access_token"
        label="Token de acesso permanente"
        type="password"
        autoComplete="off"
        required
        hint="Gerado por um usuário do sistema. Fica criptografado; ninguém consegue ler de volta."
      />
      <SelectField id="default_module" label="Módulo padrão do número" defaultValue="">
        <ModuleOptions modules={modules} />
      </SelectField>
      <div className="sm:col-span-2 space-y-3">
        <FormMessage state={state} />
        <SubmitButton pendingLabel="Validando com a Meta…">Conectar número</SubmitButton>
      </div>
    </form>
  );
}

export function NumberRow({
  slug,
  number,
  modules,
  canEdit,
}: {
  slug: string;
  number: NumberView;
  modules: ModuleKey[];
  canEdit: boolean;
}) {
  const [state, update] = useActionState(updateNumber, undefined);
  const [deleteState, remove] = useActionState(deleteNumber, undefined);
  const active = number.status === 'active';
  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-text">{number.display_number}</p>
          <p className="text-sm text-muted">
            {number.verified_name ?? 'Nome não verificado'} · ID {number.phone_number_id} · token
            ••••{number.token_last4}
          </p>
          <p className="text-sm text-muted">
            Módulo padrão:{' '}
            {number.default_module
              ? MODULE_LABELS[number.default_module as ModuleKey]
              : 'pelo tipo de contato'}
          </p>
        </div>
        <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Ativo' : 'Desativado'}</Badge>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-end gap-3">
          <form action={update} className="flex items-end gap-2">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="number_id" value={number.id} />
            <input type="hidden" name="intent" value="module" />
            <SelectField
              id={`module-${number.id}`}
              name="default_module"
              label="Módulo padrão"
              defaultValue={number.default_module ?? ''}
            >
              <ModuleOptions modules={modules} />
            </SelectField>
            <SubmitButton variant="secondary" size="sm">
              Salvar
            </SubmitButton>
          </form>
          <form action={update}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="number_id" value={number.id} />
            <input type="hidden" name="intent" value="check" />
            <SubmitButton variant="secondary" size="sm" pendingLabel="Testando…">
              Testar conexão
            </SubmitButton>
          </form>
          <form action={update}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="number_id" value={number.id} />
            <input type="hidden" name="intent" value="toggle" />
            <input type="hidden" name="status" value={number.status} />
            <SubmitButton variant="ghost" size="sm">
              {active ? 'Desativar' : 'Reativar'}
            </SubmitButton>
          </form>
          <form
            action={remove}
            onSubmit={(e) => {
              if (!confirm(`Excluir o número ${number.display_number}?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="number_id" value={number.id} />
            <SubmitButton variant="ghost" size="sm" pendingLabel="Excluindo…">
              Excluir
            </SubmitButton>
          </form>
          <details className="w-full">
            <summary className="cursor-pointer text-sm font-medium text-accent-text">
              Trocar o token
            </summary>
            <form action={update} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="number_id" value={number.id} />
              <input type="hidden" name="intent" value="token" />
              <div className="min-w-64 flex-1">
                <TextField
                  id={`token-${number.id}`}
                  name="access_token"
                  label="Novo token"
                  type="password"
                  autoComplete="off"
                  required
                />
              </div>
              <SubmitButton size="sm" pendingLabel="Validando…">
                Trocar token
              </SubmitButton>
            </form>
          </details>
        </div>
      ) : null}
      <FormMessage state={state ?? deleteState} />
    </li>
  );
}
