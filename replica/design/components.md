# Componentes do painel

Primitivos em `apps/web/src/components/ui`. Tokens em `tokens.json` (papéis); o trio `accent` vem da
marca do tenant em tempo de execução, com contraste garantido por `@nurion/shared/color`.

```
Button
  variants  primary (accent), secondary, ghost, danger
  sizes     sm 32px, md 40px, lg 48px
  states    default, hover, focus-visible (anel 2px focus), disabled, pending (SubmitButton: rótulo "Salvando…", aria-busy)
  a11y      <button> real; type="button" por padrão

Field (TextField, SelectField, TextAreaField)
  partes    label + controle + dica ou erro (aria-describedby, aria-invalid, role=alert no erro)
  states    default, focus-visible, disabled, inválido

Card / CardTitle      superfície bg com borda e sombra card
Alert + FormMessage   error (role=alert), success/info/warning (role=status)
Badge                 neutral, accent, success, warning, danger
PageHeader            título h1 + descrição + ações
AppShell              cabeçalho com marca (logo ou inicial), seletor de tenant, menu da conta;
                      barra lateral ≥ 1024 px; menu <details> no celular
```

Contraste: `python3 .claude/skills/replica-design/contrast.py replica/design/tokens.json` → 16 pares, 0 falhas.
Telas verificadas com axe (WCAG 2 A/AA) nos testes e2e.
