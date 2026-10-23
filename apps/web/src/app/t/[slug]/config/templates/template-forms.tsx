'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/alert';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { addTemplate, deleteTemplate, syncTemplates } from './actions';

export function SyncButton({ slug }: { slug: string }) {
  const [state, action] = useActionState(syncTemplates, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <SubmitButton variant="secondary" pendingLabel="Sincronizando…">
        Sincronizar com a Meta
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AddTemplateForm({ slug, wabas }: { slug: string; wabas: string[] }) {
  const [state, action] = useActionState(addTemplate, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="slug" value={slug} />
      <SelectField id="waba_id" label="Conta do WhatsApp (WABA)" required>
        {wabas.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </SelectField>
      <TextField
        id="name"
        label="Nome"
        required
        pattern="[a-z0-9_]+"
        hint="Só minúsculas, números e _ (ex.: alerta_temperatura)."
      />
      <SelectField id="category" label="Categoria" defaultValue="utility">
        <option value="utility">Utilidade</option>
        <option value="marketing">Marketing</option>
        <option value="authentication">Autenticação</option>
      </SelectField>
      <SelectField id="language" label="Idioma" defaultValue="pt_BR">
        <option value="pt_BR">Português (Brasil)</option>
      </SelectField>
      <div className="sm:col-span-2">
        <TextAreaField
          id="body"
          label="Texto"
          required
          maxLength={1024}
          hint="Use {{1}}, {{2}}… para as partes variáveis."
        />
      </div>
      <div className="space-y-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton>Registrar template</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteTemplateButton({
  slug,
  id,
  name,
}: {
  slug: string;
  id: string;
  name: string;
}) {
  const [state, action] = useActionState(deleteTemplate, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Remover o template ${name} do Nurion Hub?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="template_id" value={id} />
      <SubmitButton variant="ghost" size="sm" pendingLabel="Removendo…">
        Remover
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
