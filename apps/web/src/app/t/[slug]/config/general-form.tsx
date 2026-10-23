'use client';

import { DEFAULT_ACCENT } from '@nurion/shared/branding';
import { ensureContrast, isHexColor, pickTextOn } from '@nurion/shared/color';
import { useActionState, useState } from 'react';
import { FormMessage } from '@/components/ui/alert';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { updateGeneral } from './actions';

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Cuiaba',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Porto_Velho',
  'America/Rio_Branco',
  'America/Noronha',
];

type Props = {
  slug: string;
  canEdit: boolean;
  values: {
    name: string;
    brandName: string;
    primary: string;
    inheritedAccent: string;
    timezone: string;
    businessHours: string;
    rules: string;
  };
};

/** S19 — general data and brand colours, with a live, contrast-safe preview. */
export function GeneralForm({ slug, canEdit, values }: Props) {
  const [state, action] = useActionState(updateGeneral, undefined);
  const [primary, setPrimary] = useState(values.primary);
  const accent = isHexColor(primary) ? primary : values.inheritedAccent || DEFAULT_ACCENT;
  const timezones = TIMEZONES.includes(values.timezone)
    ? TIMEZONES
    : [values.timezone, ...TIMEZONES];

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="slug" value={slug} />
      <fieldset disabled={!canEdit} className="space-y-5">
        <TextField
          id="name"
          label="Nome da empresa"
          defaultValue={values.name}
          required
          minLength={2}
          maxLength={120}
        />
        <TextField
          id="brand_name"
          label="Nome exibido no painel"
          hint="Opcional. Sem ele, aparece o nome da marca do parceiro."
          defaultValue={values.brandName}
          maxLength={60}
        />
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <TextField
            id="primary"
            label="Cor principal"
            hint="Formato #RRGGBB. Em branco, usa a cor do parceiro."
            placeholder={values.inheritedAccent}
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            pattern="#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?"
          />
          <input
            type="color"
            aria-label="Escolher cor principal"
            value={isHexColor(primary) && primary.length === 7 ? primary : accent}
            onChange={(e) => setPrimary(e.target.value)}
            className="h-10 w-16 cursor-pointer rounded-md border border-border-input bg-bg"
          />
        </div>
        <div
          className="rounded-md border border-border bg-surface p-4"
          aria-label="Prévia das cores"
        >
          <p className="mb-3 text-sm text-muted">
            Prévia (o contraste é ajustado automaticamente):
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold"
              style={{ background: accent, color: pickTextOn(accent) }}
            >
              Botão principal
            </span>
            <span
              className="text-sm font-semibold"
              style={{ color: ensureContrast(accent, '#ffffff') }}
            >
              Link ou destaque
            </span>
          </div>
        </div>
        <SelectField id="timezone" label="Fuso horário" defaultValue={values.timezone}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace('America/', '').replace('_', ' ')}
            </option>
          ))}
        </SelectField>
        <TextField
          id="business_hours"
          label="Horário de atendimento"
          hint="Ex.: Seg–Sex 8h–18h. Usado pelos agentes para avisar quando um humano vai responder."
          defaultValue={values.businessHours}
          maxLength={300}
        />
        <TextAreaField
          id="rules"
          label="Regras da empresa para a IA"
          hint="Orientações gerais (tom, o que nunca dizer). A IA continua respondendo só com base nos documentos aprovados."
          defaultValue={values.rules}
          maxLength={4000}
        />
      </fieldset>
      <FormMessage state={state} />
      {canEdit ? <SubmitButton>Salvar</SubmitButton> : null}
    </form>
  );
}
