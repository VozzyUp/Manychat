'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/alert';
import { TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { addDepartment, deleteDepartment, renameDepartment } from '../actions';

export function AddDepartmentForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(addDepartment, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="slug" value={slug} />
      <div className="min-w-48 flex-1">
        <TextField id="department-name" name="name" label="Novo setor" required maxLength={80} />
      </div>
      <SubmitButton>Adicionar</SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DepartmentRow({
  slug,
  id,
  name,
  canEdit,
}: {
  slug: string;
  id: string;
  name: string;
  canEdit: boolean;
}) {
  const [renameState, rename] = useActionState(renameDepartment, undefined);
  const [deleteState, remove] = useActionState(deleteDepartment, undefined);
  if (!canEdit) return <li className="py-3 text-sm text-text">{name}</li>;
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={rename} className="flex flex-1 items-center gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="department_id" value={id} />
          <label htmlFor={`dept-${id}`} className="sr-only">
            Nome do setor
          </label>
          <input
            id={`dept-${id}`}
            name="name"
            defaultValue={name}
            required
            maxLength={80}
            className="h-8 min-w-0 flex-1 rounded-md border border-border-input bg-bg px-2 text-sm"
          />
          <SubmitButton variant="secondary" size="sm">
            Renomear
          </SubmitButton>
        </form>
        <form
          action={remove}
          onSubmit={(e) => {
            if (!confirm(`Excluir o setor ${name}?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="department_id" value={id} />
          <SubmitButton variant="ghost" size="sm" pendingLabel="Excluindo…">
            Excluir
          </SubmitButton>
        </form>
      </div>
      <FormMessage state={renameState ?? deleteState} />
    </li>
  );
}
