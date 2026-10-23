'use client';

import { CONTACT_KINDS, type ContactKind } from '@nurion/shared/domain';
import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/alert';
import { SelectField, TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { CONTACT_KIND_LABELS } from '@/lib/labels';
import { anonymizeContact, createContact, updateContact } from './actions';

function KindOptions() {
  return (
    <>
      {CONTACT_KINDS.map((k) => (
        <option key={k} value={k}>
          {CONTACT_KIND_LABELS[k]}
        </option>
      ))}
    </>
  );
}

export function CreateContactForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(createContact, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="slug" value={slug} />
      <TextField
        id="phone"
        label="WhatsApp"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        required
        placeholder="(11) 98765-4321"
        hint="Com DDD. Outro país: comece com + e o código."
      />
      <TextField id="name" label="Nome" autoComplete="off" maxLength={120} />
      <SelectField id="kind" label="Tipo" defaultValue="driver">
        <KindOptions />
      </SelectField>
      <div className="space-y-3 sm:col-span-3">
        <FormMessage state={state} />
        <SubmitButton pendingLabel="Cadastrando…">Cadastrar contato</SubmitButton>
      </div>
    </form>
  );
}

export function EditContactForm({
  slug,
  contact,
}: {
  slug: string;
  contact: { id: string; name: string | null; kind: ContactKind };
}) {
  const [state, action] = useActionState(updateContact, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="contact_id" value={contact.id} />
      <TextField
        id="name"
        label="Nome"
        defaultValue={contact.name ?? ''}
        autoComplete="off"
        maxLength={120}
      />
      <SelectField
        id="kind"
        label="Tipo"
        defaultValue={contact.kind}
        hint="Define qual agente atende: motorista, paciente ou equipe."
      >
        <KindOptions />
      </SelectField>
      <div className="space-y-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton>Salvar</SubmitButton>
      </div>
    </form>
  );
}

export function AnonymizeForm({ slug, contactId }: { slug: string; contactId: string }) {
  const [state, action] = useActionState(anonymizeContact, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="contact_id" value={contactId} />
      <label className="flex items-start gap-2 text-sm text-text">
        <input type="checkbox" name="confirm" value="yes" required className="mt-1" />
        <span>
          Entendo que nome, número, mensagens, transcrições e arquivos deste contato serão apagados
          e que isso não pode ser desfeito.
        </span>
      </label>
      <FormMessage state={state} />
      <SubmitButton variant="danger" pendingLabel="Anonimizando…">
        Anonimizar contato
      </SubmitButton>
    </form>
  );
}
