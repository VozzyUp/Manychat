'use client';

import { COLLECTIONS, type Collection } from '@nurion/shared/domain';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, type ReactNode } from 'react';
import { FormMessage } from '@/components/ui/alert';
import { SelectField, TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { COLLECTION_LABELS } from '@/lib/labels';
import {
  addVersion,
  createDocument,
  reingestVersion,
  transitionVersion,
  updateDocument,
  updateVersion,
} from './actions';

export type Owner = { userId: string; name: string };

const ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown';

function CollectionOptions() {
  return (
    <>
      {COLLECTIONS.map((c) => (
        <option key={c} value={c}>
          {COLLECTION_LABELS[c]}
        </option>
      ))}
    </>
  );
}

function OwnerOptions({ owners }: { owners: Owner[] }) {
  return (
    <>
      <option value="">Sem responsável</option>
      {owners.map((o) => (
        <option key={o.userId} value={o.userId}>
          {o.name}
        </option>
      ))}
    </>
  );
}

const FILE_HINT = 'PDF, DOCX, TXT ou MD, até 20 MB. PDF escaneado (imagem) ainda não é lido.';

export function CreateDocumentForm({ slug, owners }: { slug: string; owners: Owner[] }) {
  const [state, action] = useActionState(createDocument, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="slug" value={slug} />
      <TextField id="title" label="Título" required maxLength={200} className="sm:col-span-2" />
      <SelectField id="collection" label="Coleção" defaultValue="pop">
        <CollectionOptions />
      </SelectField>
      <TextField
        id="code"
        label="Código"
        maxLength={40}
        placeholder="POP-015"
        hint="Opcional. Único na empresa."
      />
      <SelectField id="owner_user_id" label="Responsável" defaultValue="">
        <OwnerOptions owners={owners} />
      </SelectField>
      <TextField id="tags" label="Etiquetas" hint="Separadas por vírgula." />
      <TextField id="effective_date" label="Vigência a partir de" type="date" />
      <TextField id="review_date" label="Próxima revisão" type="date" />
      <TextField
        id="file"
        label="Arquivo"
        type="file"
        accept={ACCEPT}
        required
        className="h-auto py-2 sm:col-span-2"
        hint={FILE_HINT}
      />
      <div className="space-y-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton pendingLabel="Enviando…">Enviar como rascunho</SubmitButton>
      </div>
    </form>
  );
}

export function UpdateDocumentForm({
  slug,
  owners,
  document,
}: {
  slug: string;
  owners: Owner[];
  document: {
    id: string;
    title: string;
    collection: Collection;
    code: string | null;
    owner_user_id: string | null;
    tags: string[];
  };
}) {
  const [state, action] = useActionState(updateDocument, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="document_id" value={document.id} />
      <TextField
        id="title"
        label="Título"
        required
        maxLength={200}
        defaultValue={document.title}
        className="sm:col-span-2"
      />
      <SelectField id="collection" label="Coleção" defaultValue={document.collection}>
        <CollectionOptions />
      </SelectField>
      <TextField id="code" label="Código" maxLength={40} defaultValue={document.code ?? ''} />
      <SelectField
        id="owner_user_id"
        label="Responsável"
        defaultValue={document.owner_user_id ?? ''}
      >
        <OwnerOptions owners={owners} />
      </SelectField>
      <TextField
        id="tags"
        label="Etiquetas"
        defaultValue={document.tags.join(', ')}
        hint="Separadas por vírgula."
      />
      <div className="space-y-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton>Salvar dados</SubmitButton>
      </div>
    </form>
  );
}

export function AddVersionForm({ slug, documentId }: { slug: string; documentId: string }) {
  const [state, action] = useActionState(addVersion, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="document_id" value={documentId} />
      <TextField
        id="new_effective_date"
        name="effective_date"
        label="Vigência a partir de"
        type="date"
      />
      <TextField id="new_review_date" name="review_date" label="Próxima revisão" type="date" />
      <TextField
        id="new_file"
        name="file"
        label="Arquivo da nova versão"
        type="file"
        accept={ACCEPT}
        required
        className="h-auto py-2 sm:col-span-2"
        hint={FILE_HINT}
      />
      <div className="space-y-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton pendingLabel="Enviando…">Criar nova versão</SubmitButton>
      </div>
    </form>
  );
}

export function VersionDatesForm({
  slug,
  documentId,
  version,
}: {
  slug: string;
  documentId: string;
  version: { id: string; effective_date: string | null; review_date: string | null };
}) {
  const [state, action] = useActionState(updateVersion, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="document_id" value={documentId} />
      <input type="hidden" name="version_id" value={version.id} />
      <TextField
        id={`eff-${version.id}`}
        name="effective_date"
        label="Vigência a partir de"
        type="date"
        defaultValue={version.effective_date ?? ''}
      />
      <TextField
        id={`rev-${version.id}`}
        name="review_date"
        label="Próxima revisão"
        type="date"
        defaultValue={version.review_date ?? ''}
      />
      <SubmitButton variant="secondary" size="sm">
        Salvar datas
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

const TRANSITION_STYLE = {
  em_revisao: 'secondary',
  rascunho: 'ghost',
  aprovado: 'primary',
  obsoleto: 'danger',
} as const;

/** One workflow button (rascunho → em_revisao → aprovado → obsoleto). Destructive ones ask first. */
export function TransitionButton({
  slug,
  documentId,
  versionId,
  to,
  children,
  confirm,
}: {
  slug: string;
  documentId: string;
  versionId: string;
  to: keyof typeof TRANSITION_STYLE;
  children: ReactNode;
  confirm?: string;
}) {
  const [state, action] = useActionState(transitionVersion, undefined);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="document_id" value={documentId} />
      <input type="hidden" name="version_id" value={versionId} />
      <input type="hidden" name="to" value={to} />
      <SubmitButton variant={TRANSITION_STYLE[to]} size="sm">
        {children}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ReingestButton({
  slug,
  documentId,
  versionId,
}: {
  slug: string;
  documentId: string;
  versionId: string;
}) {
  const [state, action] = useActionState(reingestVersion, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="document_id" value={documentId} />
      <input type="hidden" name="version_id" value={versionId} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Reiniciando…">
        Reprocessar
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/** While a version is being processed, refresh the page every few seconds. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
