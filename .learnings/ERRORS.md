# Errors

Command failures and integration errors.

---

## 2026-04-16 — iFood migration: `external_id` ja existe em orders

Ao aplicar `20260416600000_ifood_integration.sql`, o Supabase emitiu:
`NOTICE (42701): column "external_id" of relation "orders" already exists, skipping`

A coluna `external_id` foi adicionada em `20260414150000_align_orders.sql`.
O `add column if not exists` e o padrao correto — ignorar o NOTICE.
Apenas `external_source` foi coluna nova; o indice composto foi criado com `create index if not exists`.

---

## 2026-04-16 — Build Next.js falha com ENOENT em 500.html (pre-existente)

`next build` falha na etapa "Collecting page data" com `rename .../500.html`.
Isso e um conflito de configuracao static export pre-existente (antes da tarefa iFood).
O codigo TypeScript compila sem erros (`tsc --noEmit` exit 0).
Nao e causado pelo codigo novo.

---

## 2026-04-16 — `z.record(z.unknown())` vs `z.record(z.string(), z.unknown())`

Com Zod 3.x, `z.record(z.unknown())` funciona mas linter prefere a assinatura explicita
`z.record(z.string(), z.unknown())`. Usar a forma explicita para evitar warnings.

---
