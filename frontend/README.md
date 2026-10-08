# Encantos da Serra — Site

React 19 servido pelo **servidor fullstack do Bun**: ele compila TSX/CSS, recarrega ao salvar e repassa `/api/*` para o backend. Sem Vite, sem framework de CSS.

```bash
cd frontend
bun install
bun run dev        # http://localhost:5173 (precisa da API rodando em :3333)
bun run typecheck
bun run build      # gera dist/ estático
```

`API_URL` muda o endereço da API (padrão `http://localhost:3333`).

## Telas

| Rota | Tela |
| --- | --- |
| `/` | Home do Figma: hero, números, categorias, três caminhos, destaques (varejo/atacado + filtros), pedido rápido, parceiro, proposta em 3 etapas, confiança, rota, próximos passos |
| `/produtos` | Catálogo com filtros (categoria, leite, cura, peso, premiados), ordenação e paginação |
| `/produtos/:slug` | Produto: compra por unidade ou caixa, tabela de faixas, lote atual |
| `/carrinho` | Carrinho, consulta de CEP/frete/rota e checkout |
| `/entrar` | Login e cadastro (pessoa física ou empresa com CNPJ) |
| `/pedidos`, `/pedidos/:code` | Meus pedidos e acompanhamento (linha do tempo, temperatura, lotes) |
| `/rastrear` | Rastreio público com código + e-mail |
| `/atacado` | Pedido rápido, calendário de rotas e minhas cotações |
| `/produtores` | Programa de parceria + proposta com autosave e anexos |

## Estrutura

```
src/
  api.ts          cliente da API + tipos
  store.tsx       sessão, carrinho, favoritos, avisos
  router.tsx      roteador mínimo (History API)
  styles.css      design system (tokens do Figma)
  icons.tsx       ícones SVG inline
  components/     Header, Footer, ProductCard, QuickOrder, ProposalWizard…
  pages/          uma tela por arquivo
public/images/    fotos exportadas do Figma
```

Os 4 produtos em destaque usam as fotos do Figma; os outros 8 reaproveitam a foto mais parecida até ganharem fotos próprias.
