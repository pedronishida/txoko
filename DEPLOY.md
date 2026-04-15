# Deploy — Txoko

Este documento descreve como colocar o Txoko em producao. O app Next.js em `apps/web` usa server actions, middleware (auth) e route handlers Node.js (Anthropic SDK), entao precisa de um runtime que suporte esses recursos.

## Recomendacao: Vercel

Vercel e o deploy mais simples porque o Next.js e feito pela propria Vercel. Server actions, middleware e route handlers funcionam sem configuracao extra.

### Passos (primeira vez)

1. **Empurrar o codigo pro GitHub.**
   ```bash
   git remote add origin https://github.com/<voce>/txoko.git
   git push -u origin main
   ```

2. **Importar no Vercel.**
   - Acesse https://vercel.com/new
   - Clique em "Import" no repositorio
   - Em **Root Directory**, coloque `apps/web`
   - Framework deve detectar automaticamente como "Next.js"
   - Build Command e Install Command ficam automaticos (ou use o `vercel.json` na raiz)

3. **Configurar variaveis de ambiente** (no dashboard Vercel, em Settings → Environment Variables):

   | Nome | Valor | Environments |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://amrigajsegjztylucdnc.supabase.co` | Production, Preview, Development |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | todos |
   | `NEXT_PUBLIC_SITE_URL` | `https://txoko.com.br` (prod) / URL do preview | todos |
   | `NEXT_PUBLIC_APP_NAME` | `Txoko` | todos |
   | `ANTHROPIC_API_KEY` | `sk-ant-...` (gerar em console.anthropic.com) | todos |

   **Importante**: nao coloque o `service_role` do Supabase aqui. Nem a senha do banco.

4. **Deploy.** O primeiro build roda automatico apos salvar as env vars. Depois cada push em `main` faz deploy automatico.

5. **Dominio customizado.**
   - Dashboard Vercel → Project → Settings → Domains
   - Adicione `txoko.com.br` e `www.txoko.com.br`
   - Vercel mostra os records DNS que voce precisa criar no Registro BR
   - Propaga em 5-60 minutos

6. **Atualizar Supabase com a URL de producao.**
   - Dashboard Supabase → Authentication → URL Configuration
   - **Site URL**: `https://txoko.com.br`
   - **Redirect URLs**: adicionar `https://txoko.com.br/**`

## Alternativa: Cloudflare Pages

O CLAUDE.md do projeto menciona Cloudflare Workers como stack preferida. Pra rodar Next.js no Cloudflare voce precisa do adapter **OpenNext for Cloudflare** (o `@cloudflare/next-on-pages` ja esta deprecated).

### Setup

```bash
cd apps/web
npm install -D @opennextjs/cloudflare
```

Criar `apps/web/wrangler.toml`:

```toml
name = "txoko-web"
main = ".open-next/worker.js"
compatibility_date = "2025-03-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".open-next/assets"
binding = "ASSETS"
```

Build command: `npx @opennextjs/cloudflare build`

Limitacoes conhecidas no Cloudflare (Workers runtime):
- **Assistente IA** funciona (Anthropic SDK usa `fetch`)
- **Realtime** funciona no cliente (o browser conecta direto no Supabase, Workers nao intermediam)
- **Next.js Image Optimization** nao funciona — ja estamos usando `images.unoptimized: true`
- **Node.js APIs** limitadas — precisa flag `nodejs_compat`

Se for pra Cloudflare, configure o DNS direto no dashboard da Cloudflare (o painel ja gerencia txoko.com.br se voce tiver mudado os nameservers).

## Migrations em producao

As migrations ja estao versionadas em `supabase/migrations/`. Nao existe CI automatico pra aplicar — voce roda manualmente:

```bash
cd /path/to/txoko-main
export SUPABASE_ACCESS_TOKEN=<seu-token>
supabase db push --password <senha-banco>
```

Ou use GitHub Actions com o workflow oficial da Supabase: https://supabase.com/docs/guides/cli/github-action

## Secrets para girar

Antes do deploy publico, **rotacione**:
- Cloudflare Global API Key (que foi compartilhada em chat)
- Supabase Access Token
- R2 tokens

Novas chaves vao em `.env.local` (local) e no dashboard do provedor de deploy (producao). Nunca commitam.

## Checklist de producao

- [ ] `ANTHROPIC_API_KEY` configurada no Vercel/Cloudflare
- [ ] Todas as env vars `NEXT_PUBLIC_*` configuradas
- [ ] Site URL e Redirect URLs atualizados no Supabase Auth
- [ ] DNS apontando pro dominio correto
- [ ] HTTPS ativo (Vercel e Cloudflare fazem automatico)
- [ ] Email autoconfirm continua ativo OU configurar SMTP no Supabase
- [ ] Testar signup → criacao de novo restaurante → onboarding seed
- [ ] Testar `/menu/[slug]` publico em mobile
- [ ] Testar pagamento Pix no PDV
- [ ] Testar assistente IA com alguma pergunta real

## CI

`.github/workflows/ci.yml` roda a cada push/PR:
- Typecheck (`tsc --noEmit`)
- Lint (`next lint`, nao bloqueia)
- Build (`next build`)

As env vars do build sao **publicas** (publishable key, URLs), entao podem ficar inline no workflow. Pra testar a route do assistente no CI, adicione `ANTHROPIC_API_KEY` como secret do GitHub — mas so precisa se voce for fazer e2e test.

## Troubleshooting comum

**Build funciona local mas quebra no Vercel**: checar se `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` estao configurados. O `generateStaticParams` do `/menu/[slug]` precisa delas no build.

**Login redireciona pra localhost**: Site URL no Supabase Auth continua apontando pra `http://localhost:3000`. Corrija no dashboard.

**Imagens do Supabase Storage nao carregam**: o bucket `product-images` esta publico? Roda `select public from storage.buckets where id = 'product-images'` no SQL Editor.

**Realtime nao atualiza**: checar se a tabela esta no `supabase_realtime` publication. Rodar `select * from pg_publication_tables where pubname = 'supabase_realtime'`.
