# Encantos da Serra

Marketplace de laticínios artesanais da serra, com três jornadas:

- **Quero comprar**: varejo para consumidor final (peças avulsas, carrinho, entrega refrigerada).
- **Atacado / B2B**: pedido rápido por caixa com preço por faixa de volume, cotação para grandes volumes.
- **Seja um produtor**: proposta de fornecimento em 3 etapas, com anexos e protocolo.

Projeto de estudos. Protótipo de referência no Figma.

## Estrutura

```
backend/    API (Bun + Hono + Postgres no Supabase)
frontend/   Site (React 19 servido pelo Bun, telas do Figma)
```

## Rodando tudo

Em dois terminais:

```bash
cd backend && bun run dev     # API em http://localhost:3333
cd frontend && bun run dev    # Site em http://localhost:5173
```

O site repassa `/api/*` para a API, então não precisa configurar CORS em dev.
Detalhes em [backend/README.md](backend/README.md) e [frontend/README.md](frontend/README.md).

## Publicação (Render)

O `render.yaml` cria um Web Service gratuito que compila o site e sobe a API, que passa a
entregar o site também (`STATIC_DIR`). O banco continua no Supabase.

1. No Render: **New → Blueprint** e escolha este repositório.
2. Preencha `DATABASE_URL` com a string do Supabase (Connect → Session pooler, porta 5432).
   O `JWT_SECRET` é gerado automaticamente.
3. Cada push na `main` publica de novo.

No plano gratuito o serviço dorme após 15 min sem visitas (a primeira visita leva cerca de
1 min) e o disco é apagado a cada reinício, então anexos de proposta não ficam salvos.
A documentação da API fica em `/docs`.
