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
- Night `#1A1A1A` — backgrounds escuros, textos principais
- Leaf `#4ADE80` — acoes primarias, sucesso, CTAs
- Warm `#F59E0B` — alertas, destaques
- Coral `#EF4444` — erros, urgencia
- Cloud `#FAFAF8` — background claro, cards
- Stone `#78716C` — textos secundarios, bordas

## Tipografia
- DM Sans — interface principal
- Space Mono — numeros, dados financeiros

## Principios de Design
1. Clareza > Decoracao
2. 1 clique < 3 cliques
3. Mobile-first
4. Feedback imediato
5. Modo escuro por padrao

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
