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
