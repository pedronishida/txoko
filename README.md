<div align="center">

# Txoko

**Sistema de gestao completo para restaurantes, bares e food services.**

Tecnologia de ponta, IA aplicada, operacao em tempo real — sem as fricoes dos ERPs tradicionais.

[![Next.js](https://img.shields.io/badge/Next.js-15-000?logo=next.js)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase)](https://supabase.com)
[![Claude](https://img.shields.io/badge/Claude-Opus_4.6-D4A574)](https://claude.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://typescriptlang.org)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss)](https://tailwindcss.com)

</div>

---

## Por que Txoko

A maioria dos sistemas pra restaurante sao **caros, lentos e feios**. O Txoko foi pensado pra ser o oposto:

- **Visual minimalista** — tipografia cuidada, dark mode por padrao, um clique em vez de tres
- **Tempo real de verdade** — Realtime via WebSocket do Supabase em mesas, pedidos, cozinha e caixa
- **IA no nucleo** — Claude Opus 4.6 responde perguntas sobre seu restaurante com dados reais e classifica o sentimento de cada avaliacao automaticamente
- **Multi-tenant desde o dia zero** — um usuario pode ser dono de varios restaurantes; tudo isolado por Row Level Security no Postgres
- **Automacoes nativas** — gatilhos SQL que reagem a eventos do banco (venda fechada, estoque critico, avaliacao negativa) sem fila de mensagem, sem cron

## Features

### Operacao
- **PDV** completo com carrinho, selecao de mesa, multi-tipo de pedido (salao, retirada, delivery, balcao)
- **KDS** (Kitchen Display System) com realtime, station routing (cozinha / bar / confeitaria), alertas de atraso
- **Mesas** com mapa visual, status por cor, QR code por mesa apontando pro cardapio digital
- **Pedidos** com filtros por tipo/status, fechamento de conta com pagamento pos-servico, liberacao automatica da mesa
- **Caixa** live — cada pagamento aparece na tela em tempo real, breakdown por metodo, saldo do dia

### Cardapio & Estoque
- **Cardapio** dashboard com CRUD, upload de imagem (Supabase Storage + Image Transformation)
- **Menu publico SSG** em `/menu/[slug]` com categorias sticky, busca, detalhe do produto em modal
- **Estoque** com ingredientes, categorias, fornecedores vinculados
- **Fichas tecnicas** — receita por produto com calculo automatico de custo, margem e lucro bruto
- **Baixa automatica de estoque** via trigger SQL quando um pedido e fechado

### CRM & Fidelidade
- **Clientes** com CRUD, segmentacao (VIP / Frequente / Novo / Inativo) calculada dos dados reais
- **Fidelidade** com RPC atomica de resgate, regras configuraveis, top clientes, historico
- **Pontos creditados automaticamente** via trigger quando pedido com `customer_id` e fechado

### Financeiro
- **Visao geral** com KPIs reais, grafico de 7 dias, breakdown por metodo, DRE completa (Receita → CMV → Lucro Bruto → Pessoal → Aluguel → Marketing → Impostos → Lucro Liquido)
- **Contas a pagar/receber** com CRUD, categorias, vencimento, marcacao de pago, auto-status "vencido"
- **Caixa diario** com movimentacoes em tempo real

### IA
- **Assistente** (chat Claude contextual) — cada pergunta monta um snapshot com 7 queries paralelas (receita do mes, pagamentos do dia, estoque critico, pedidos ativos, top produtos, customers, settings) e envia como contexto. **Prompt caching** no system prompt pra minimizar custos em conversas multi-turn
- **Analise de sentimento** — toda avaliacao criada passa pelo Claude que classifica como `positive | neutral | negative`. Fallback heuristico por nota quando a API key esta ausente

### Avaliacoes
- **Dashboard** de NPS, distribuicao de notas, filtros por sentimento
- **Pagina publica de avaliar** em `/menu/[slug]/avaliar` — cliente escaneia QR, da nota, escolhe NPS 0-10, escreve comentario. Envio anonimo via policy RLS especifica pra `source=qrcode`
- **Widget publico de reviews** no menu — ultimas 10 avaliacoes com comentario aparecem na parte de baixo do `/menu/[slug]`

### Automacoes
- **Catalogo de 20** automacoes prontas (estoque critico, nova venda, aniversario, churn 30d, avaliacao negativa, etc)
- **3 triggers LIVE** conectados a eventos reais do banco:
  - `stock_low`: disparado quando um ingrediente cai abaixo do minimo
  - `sale_finalized`: disparado quando um pedido vira `closed`
  - `negative_review`: disparado quando o Claude classifica uma review como negativa
- **Logs em tempo real** aparecem no painel lateral sem reload

### Multi-tenant
- **Onboarding automatico**: cada signup cria um restaurante proprio com seed completo (categorias, mesas, automacoes)
- **Seletor de restaurante** no header quando o usuario e membro de mais de um
- **Cookie httpOnly** persiste a selecao por 1 ano

## Stack

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend                                                   │
│  Next.js 15 (App Router) · Tailwind 4 · TypeScript strict   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│  Server                                                     │
│  Server Components · Server Actions · Route Handlers (Node) │
│  @supabase/ssr · @anthropic-ai/sdk · Realtime subscriptions │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│  Database                                                   │
│  Supabase Postgres 17 · Row Level Security em todas tabelas │
│  9+ triggers SQL · RPC atomicas · Realtime publication      │
└─────────────────────────────────────────────────────────────┘
```

**Storage**: Supabase Storage (`product-images` bucket publico com Image Transformation)

**Auth**: Supabase Auth (email/senha, magic link pronto pra ativar)

**Deploy**: Cloudflare Workers via OpenNext adapter (veja [DEPLOY.md](./DEPLOY.md))

## Arquitetura

### Estrutura do monorepo

```
txoko-main/
├── apps/
│   └── web/                  Next.js 15 — dashboard + menu publico + API routes
├── packages/
│   ├── shared/               Types TypeScript + constants + enums (usado no web)
│   └── ui/                   Placeholder para design system compartilhado
├── workers/
│   └── api/                  Cloudflare Worker (Hono.js) — futuro, pra webhooks
├── services/                 Microservicos (fiscal, futuros)
└── supabase/
    ├── migrations/           14 migrations versionadas
    ├── config.toml           Config Supabase CLI
    └── seed.sql              Seed do restaurante demo
```

### Modelagem core

18 tabelas no schema public, todas com `restaurant_id` + RLS:

```
restaurants  ←→  restaurant_members  ←→  auth.users
     ↓
     ├── categories (kitchen|bar|dessert)
     │       ↓
     ├── products ←── product_recipes ──→ ingredients ←── suppliers
     │       ↓
     ├── tables
     │       ↓
     ├── customers
     │       ↓
     ├── orders ──→ order_items
     │       ↓
     ├── payments
     │
     ├── reviews (com sentiment classificado por Claude)
     ├── loyalty_redemptions (RPC atomica)
     ├── financial_transactions (contas a pagar/receber)
     ├── automations + automation_logs (catalogo + historico)
```

### Triggers SQL rodando no banco

| Trigger | Quando | O que faz |
|---|---|---|
| `handle_new_user` | novo signup (`auth.users` INSERT) | cria restaurante + membership + seed completo |
| `consume_stock_on_order_closed` | `orders.status → closed` | subtrai estoque de ingredientes via fichas tecnicas |
| `update_loyalty_on_order_closed` | `orders.status → closed` (com customer) | credita pontos (1/R$ 10) |
| `auto_close_paid_non_dine_in` | `orders.status → delivered` | auto-fecha se nao-dine_in e com pagamento ja aprovado |
| `auto_trigger_stock_low` | `ingredients.current_stock` < `min_stock` | loga em `automation_logs` |
| `auto_trigger_sale_finalized` | `orders.status → closed` | loga venda finalizada |
| `auto_trigger_negative_review` | `reviews` INSERT com `sentiment=negative` | loga alerta pro gestor |

## Integracoes Claude

### Assistente contextual (`/dashboard/assistente`)
Route handler Node que monta um contexto estruturado do restaurante (7 queries paralelas) e envia pro `claude-opus-4-6` com prompt caching no system prompt. Responde em portugues, concisamente, usando dados reais.

### Sentiment analysis (`createReview` action)
Cada review criada passa pelo Claude antes de inserir. Prompt minimalista pede uma palavra (`positive | neutral | negative`). Fallback heuristico baseado na nota quando a API key esta ausente — a pagina funciona sem Claude tambem.

## Paleta de cores

Seguindo o design brief do projeto:

| Token | Hex | Uso |
|---|---|---|
| Night | `#1A1A1A` | backgrounds, textos principais |
| Leaf | `#4ADE80` | acoes primarias, sucesso, CTAs |
| Warm | `#F59E0B` | alertas, destaques |
| Coral | `#EF4444` | erros, urgencia |
| Cloud | `#FAFAF8` | background claro, cards |
| Stone | `#78716C` | textos secundarios, bordas |

## Rodando localmente

```bash
# Clone
git clone https://github.com/<voce>/txoko.git
cd txoko

# Install (monorepo)
npm install

# Supabase — se for criar um projeto novo
# (o projeto atual ja esta linkado; veja supabase/config.toml)
supabase link --project-ref <ref>
supabase db push

# Env vars
cp .env.example apps/web/.env.local
# editar com suas credenciais Supabase e Anthropic

# Dev server
npm run dev:web
```

Acesse `http://localhost:3000`. Cadastre-se e voce sera automaticamente vinculado como owner de um restaurante novo (trigger `handle_new_user`).

## Desenvolvimento

```bash
# Dev (web app)
npm run dev:web

# Typecheck
npm run typecheck --workspace=apps/web

# Lint
npm run lint --workspace=apps/web

# Build
npm run build --workspace=apps/web

# Nova migration
# Edite ou crie arquivo em supabase/migrations/
# Depois:
supabase db push --password <senha>
```

## Deploy

Veja [DEPLOY.md](./DEPLOY.md) pro guia completo. TL;DR:

- **Vercel** (mais simples): import do repo, root dir `apps/web`, env vars no dashboard
- **Cloudflare Workers** (recomendado pelo CLAUDE.md): OpenNext adapter, `wrangler deploy`

## Roadmap

Ja entregue:

- [x] Schema multi-tenant com RLS
- [x] Auth real (Supabase) com onboarding automatico
- [x] PDV + KDS + Mesas + Pedidos + Caixa com realtime
- [x] Cardapio com upload de imagem
- [x] Menu publico com SSG + widget de reviews
- [x] Avaliacao publica via QR code + sentimento por IA
- [x] Financeiro (overview + caixa + contas) com DRE real
- [x] Estoque + fornecedores + fichas tecnicas com baixa automatica
- [x] Clientes + fidelidade com RPC atomica
- [x] Assistente IA contextual (Claude Opus 4.6)
- [x] Automacoes com triggers SQL reais
- [x] Seletor de restaurante ativo (multi-tenant completo)
- [x] Realtime escopado por restaurante em 8 paginas

Proximo:

- [ ] Integracao fiscal (NFC-e, NF-e) via microservico `services/fiscal`
- [ ] Worker API (`workers/api`) para webhooks iFood e pagamentos
- [ ] App mobile (`apps/mobile`) — garcom via React Native
- [ ] KDS como PWA (`apps/kds`) fullscreen com instalacao
- [ ] Design system extraido em `packages/ui`
- [ ] Split payments (pedido com varios metodos)
- [ ] E2E tests com Playwright

## Licenca

Proprietario. Todos os direitos reservados.

---

<div align="center">
<sub>
Construido com <a href="https://claude.com">Claude</a> · Designed para restaurantes brasileiros
</sub>
</div>
