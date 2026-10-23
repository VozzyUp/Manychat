'use client';

import { ROLES, type Role } from '@nurion/shared/domain';
import { useActionState } from 'react';
import { FormMessage } from '@/components/ui/alert';
import { SelectField, TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { ROLE_LABELS } from '@/lib/labels';
import { changeMemberRole, inviteMember, removeMember } from '../actions';

const rolesFor = (myRole: Role) =>
  [...ROLES].reverse().filter((r) => r !== 'owner' || myRole === 'owner');

export function InviteForm({ slug, myRole }: { slug: string; myRole: Role }) {
  const [state, action] = useActionState(inviteMember, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="slug" value={slug} />
      <TextField id="email" label="E-mail" type="email" required autoComplete="off" />
      <TextField id="full_name" label="Nome (opcional)" maxLength={120} />
      <SelectField id="role" label="Papel" defaultValue="operator">
        {rolesFor(myRole).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </SelectField>
      <div className="flex items-end">
        <SubmitButton pendingLabel="Enviando…">Convidar</SubmitButton>
      </div>
      <div className="sm:col-span-2">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function MemberRow({
  slug,
  member,
  myRole,
  isMe,
  canManage,
}: {
  slug: string;
  member: { id: string; name: string; email: string; role: Role };
  myRole: Role;
  isMe: boolean;
  canManage: boolean;
}) {
  const [roleState, saveRole] = useActionState(changeMemberRole, undefined);
  const [removeState, remove] = useActionState(removeMember, undefined);
  const locked = !canManage || (member.role === 'owner' && myRole !== 'owner');
  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-text">
            {member.name}{' '}
            {isMe ? <span className="text-sm font-normal text-muted">(você)</span> : null}
          </p>
          <p className="truncate text-sm text-muted">{member.email}</p>
        </div>
        {locked ? (
          <span className="text-sm text-muted">{ROLE_LABELS[member.role]}</span>
        ) : (
          <>
            <form action={saveRole} className="flex items-center gap-2">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="member_id" value={member.id} />
              <label htmlFor={`role-${member.id}`} className="sr-only">
                Papel de {member.name}
              </label>
              <select
                id={`role-${member.id}`}
                name="role"
                defaultValue={member.role}
                className="h-8 rounded-md border border-border-input bg-bg px-2 text-sm"
              >
                {rolesFor(myRole).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <SubmitButton variant="secondary" size="sm">
                Salvar
              </SubmitButton>
            </form>
            <form
              action={remove}
              onSubmit={(e) => {
                if (!confirm(`Remover o acesso de ${member.name}?`)) e.preventDefault();
              }}
            >
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="member_id" value={member.id} />
              <SubmitButton variant="ghost" size="sm" pendingLabel="Removendo…">
                Remover
              </SubmitButton>
            </form>
          </>
        )}
      </div>
      <FormMessage state={roleState ?? removeState} />
    </li>
  );
}
