# Encantos da Serra — API

Backend do site. **Bun + Hono + Zod**, banco **Postgres no Supabase** acessado por conexão direta (cliente SQL nativo do Bun). Sem ORM: as tabelas vivem em migrations SQL versionadas em `db/migrations/`.

## Rodando

```bash
cd backend
cp .env.example .env      # preencha DATABASE_URL, JWT_SECRET e SEED_PASSWORD
bun install
bun run db:migrate        # cria as tabelas no Supabase
bun run db:seed           # dados de demonstração do protótipo
bun run dev               # http://localhost:3333
```

Abra `http://localhost:3333` para ver todas as rotas. `GET /health` confere a conexão com o banco.

| Script | O que faz |
| --- | --- |
| `bun run dev` | servidor com reload |
| `bun run db:migrate` | aplica migrations pendentes (controle em `schema_migrations`) |
| `bun run db:seed` | popula banco vazio; `bun run db:seed --reset` apaga e recria |
| `bun test` | testes |
| `bun run typecheck` | checagem de tipos |

### Supabase

Use a URI do **Session pooler** (Supabase → Connect → Session pooler, porta 5432). O host direto `db.<ref>.supabase.co` só tem IPv6.

Todas as tabelas ficam com **RLS ligado e sem políticas**, ou seja, a REST pública do Supabase (`/rest/v1`) não enxerga nada, nem com a chave anon. Só o backend acessa os dados.

## Painel admin sem login (temporário)

`ADMIN_AUTH_DISABLED=true` no `.env` libera `/api/admin/*` sem login. As ações ficam registradas no primeiro usuário admin. **Antes de publicar, troque para `false`**: com isso, só contas `admin` acessam.

## Convenções

- Dinheiro sempre em **centavos** (`priceCents`, `totalCents`).
- Erros: `{ "error": { "code", "message", "details?" } }`.
- Autenticação: `Authorization: Bearer <token>` (JWT de 7 dias, retornado em `/api/auth/login` e `/register`).
- Papéis: `customer`, `business` (B2B, exige CNPJ válido), `producer`, `admin`.

## Rotas principais

| Área | Rotas |
| --- | --- |
| Home | `GET /api/home`: números, lote da semana, categorias, destaques, próxima rota |
| Catálogo | `GET /api/products` (filtros `milk`, `cureMin`, `cureMax`, `awarded`, `maxWeight`, `minWeight`, `category`, `q`, `sort`, `page`), `GET /api/products/:slug`, `GET /api/products/filters`, `GET /api/categories`, `GET /api/producers/:slug`, `GET /api/lots/:code` |
| Busca | `GET /api/search/suggest?q=` (cabeçalho) |
| Conta | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `PUT/DELETE /api/me/favorites/:productId` |
| Carrinho | `POST /api/cart`, `GET /api/cart/:token`, `PUT /api/cart/:token/items`, `DELETE /api/cart/:token/items/:itemId` |
| Pedidos | `POST /api/orders` (checkout do carrinho), `GET /api/orders`, `GET /api/orders/:code`, `GET /api/orders/track?code=&email=` |
| Atacado | `GET /api/wholesale/catalog`, `POST /api/wholesale/quick-order/price`, `POST /api/wholesale/quick-order/checkout`, `POST /api/wholesale/quotes`, `POST /api/wholesale/quotes/:code/accept\|decline` |
| Entrega | `GET /api/delivery/cep/:cep` (região, frete, próxima rota), `GET /api/delivery/routes` |
| Produtor | `GET /api/supplier-proposals/options`, `POST /api/supplier-proposals`, `PATCH /:protocol` (autosave), `POST /:protocol/attachments`, `POST /:protocol/submit`. Use o header `X-Edit-Token` |
| Contato | `POST /api/contact` |
| Admin | `/api/admin/orders?filter=open\|uncovered\|in_transit\|…` (pedidos com cobertura de estoque), `POST /api/admin/orders/:code/events` (avança status), `/api/admin/inventory` (físico/reservado/disponível), `POST /api/admin/inventory/:id/movements` (entrada, perda, saída, contagem), `PATCH /api/admin/inventory/:id` (mínimo), cotações, propostas |

## Regras de negócio

- **Atacado por faixa**: o preço por unidade depende do total de caixas do produto (ex.: 1–4, 5–11, 12+). A economia é calculada contra a 1ª faixa ("Você economiza R$ X nesta faixa").
- **Compra por caixa** só para contas `business`. Pedido com caixa vira canal `wholesale`.
- **Estoque em três números** (view `product_stock`):
  - **físico** (`products.stock_units`): o que está na câmara fria;
  - **reservado**: unidades em pedidos abertos (recebido, confirmado, em separação);
  - **disponível** = físico − reservado: o que a loja vende.
  O checkout trava as linhas dos produtos (`for update`) e só reserva se houver disponível. A **baixa física acontece na expedição**. Toda mudança no físico gera uma linha em `stock_movements` (entrada, saída, perda, contagem, expedição, devolução).
- **Cobertura dos pedidos**: o estoque físico é distribuído entre os pedidos abertos por ordem de chegada (`src/lib/coverage.ts`). Um pedido fica coberto, parcial ou sem estoque. Expedir um pedido que não está coberto exige `force: true`, porque passa na frente de pedidos mais antigos.
- **Fluxo do pedido**: recebido → confirmado → em separação → em rota → entregue (cancelado a partir de qualquer etapa antes de entregue). Pular etapas é bloqueado. Cancelar antes da expedição só libera a reserva; depois dela, devolve ao físico.
- **Rota de entrega**: cada região tem faixa de CEP, dias de rota e prazo de corte. A data prevista é a próxima rota depois do corte, no fuso `America/Sao_Paulo`.
- **Proposta de produtor**: rascunho sem login (protocolo + token secreto), anexos PDF/JPG/PNG até 10 MB validados pela assinatura do arquivo, envio exige as 3 etapas completas.
- **Rastreabilidade**: cada item de pedido guarda o lote mais recente do produto (origem, data de produção, cura).

## Nota sobre instalação

Nesta máquina `registry.npmjs.org` está inacessível, e o `bunfig.toml` aponta para o espelho `registry.yarnpkg.com`. Se `bun install` falhar com `ConnectionClosed`, é esse bloqueio de rede: as URLs dos pacotes no espelho ainda apontam para o npmjs.
