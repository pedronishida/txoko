# Txoko — Sistema de Gestao para Restaurantes

## O que eh
SaaS de gestao completo para restaurantes, bares e food services. Combina simplicidade com IA aplicada e automacoes nativas.

## Stack
- **Frontend:** Next.js 15 (App Router) com Tailwind CSS + shadcn/ui
- **Backend:** Cloudflare Workers (Hono.js) + Supabase Edge Functions
- **Database:** Supabase PostgreSQL com Row Level Security
- **Auth:** Supabase Auth (email, magic link, OAuth, MFA)
- **Realtime:** Supabase Realtime (WebSocket)
- **Storage:** Cloudflare R2 + Supabase Storage
- **IA:** Claude API (Anthropic)
- **Monorepo:** Turborepo + npm workspaces

## Estrutura do Monorepo
```
apps/web/          → Next.js (dashboard, admin, cardapio publico)
apps/mobile/       → React Native / Expo (app garcom) [futuro]
apps/kds/          → PWA cozinha [futuro]
packages/shared/   → Types TypeScript, validacoes Zod, constantes
packages/ui/       → Design system compartilhado [futuro]
workers/api/       → Cloudflare Workers com Hono.js [futuro]
workers/webhooks/  → Receivers (iFood, pagamentos) [futuro]
services/fiscal/   → Microservico NF-e/NFC-e (Fly.io) [futuro]
supabase/          → Migrations, Edge Functions, seed [futuro]
```

## Convencoes de Codigo
- TypeScript strict em TUDO (zero `any`)
- Validacao com Zod em todos os inputs
- Componentes React: function components + hooks
- Nomenclatura arquivos: kebab-case (ex: `order-list.tsx`)
- Nomenclatura banco: snake_case (ex: `order_items`)
- Path aliases: `@/components`, `@/lib`, `@/hooks`
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`)

## Paleta de Cores
Toda cor sai dos tokens em `apps/web/src/app/globals.css`. **Nenhuma tela
declara `oklch()` nem hex literal** — e isso que faz os dois temas
continuarem corretos sem revisao dupla.

- `--ink` / `--ink-soft` / `--ink-muted` — texto principal, apoio, rotulos
- `--bg` / `--island` / `--panel` — fundo, ilhas (header, sidebar, conteudo), cartoes
- `--rule` / `--rule-faint` — divisorias e bordas
- `--teal` / `--teal-deep` / `--teal-soft` — acao primaria, selecao, foco, sucesso
- `--amber` (decorativo) / `--amber-text` (legivel) — alertas e destaques
- `--red` / `--red-tint` — atraso, cancelamento, critico
- `--overlay` / `--scrim` — modais (opaco) e o veu atras deles

Os nomes antigos (night, leaf, warm, coral, cloud, stone) seguem mapeados
sobre esses tokens por compatibilidade. Nao usar em codigo novo.

## Tema
Claro por padrao. O escuro e **preferencia gravada do usuario, nao o tema do
sistema**: a escolha vive em `localStorage['txoko-theme']` e o tema ativo
aparece como `data-theme` no `<html>`. A variante `dark:` do Tailwind segue
esse atributo, nao a classe `.dark`.

## Tipografia
- **Archivo** — tudo que se le como texto
- **Space Mono** — so o que se compara em coluna: numeros, codigos, horarios
  e duracoes. Nunca em texto corrido, nunca em rotulo. Use `.font-data`.
- Moeda e unidade tipografica: use `<Money>` ou `formatCurrency`, que unem
  simbolo e valor com U+202F. Nunca montar `'R$ ' + valor` a mao.

## Elevacao
Tres niveis, e so tres. Nada de sombra ad hoc.
- `--e1` — cartoes dentro do conteudo (metricas, KPIs, cards do KDS)
- `--e2` — a ilha de conteudo, que apenas repousa sobre o fundo
- `--e3` — o que flutua: header, sidebar, modais, popovers

## Principios de Design
1. Clareza > Decoracao
2. 1 clique < 3 cliques
3. Feedback imediato
4. Foco sempre visivel — anel de 2px em `--teal`, offset 2px. PDV e KDS sao
   telas de teclado; nao remover por questao estetica.
5. Alvo minimo de 44px em PDV, KDS, Mesas, Pedidos, Reservas e na navegacao
   lateral. O denso de 32-38px so vale em Financeiro, Cardapio e Clientes,
   que sao telas de mouse.
6. Trocar de tela nao anima.

## Seguranca
- NUNCA expor Supabase `service_role` key no frontend
- Workers usam `anon` key + auth do usuario logado
- Todas as mutations passam por validacao Zod antes do banco
- Dados sensiveis (CPF, cartao) sempre criptografados
- Multi-tenant: toda tabela tem `restaurant_id` + RLS

## Multi-Tenancy
- Toda tabela tem coluna `restaurant_id`
- RLS policy baseada em `auth.uid()` → lookup para `restaurant_id`
- Service role key NUNCA no frontend
