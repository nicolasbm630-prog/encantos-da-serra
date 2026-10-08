import { useEffect } from "react";
import { type Home as HomeData, type ProductList } from "../api";
import { CepLookup } from "../components/CepLookup";
import { HeroBanner, type Slide } from "../components/HeroBanner";
import { ProductRail } from "../components/ProductRail";
import { Icon } from "../icons";
import { Link } from "../router";
import { useApi } from "../store";

// Atalhos do topo da vitrine. A API não manda foto de categoria; usamos um produto representativo
// (o protótipo repete a mesma foto nos queijos frescos, então eles usam um recorte da mesa).
const SHORTCUTS: { label: string; to: string; image: string; position?: string }[] = [
  { label: "Queijos frescos", to: "/produtos?categoria=queijos-frescos", image: "/images/site/hero-mesa.jpg", position: "88% 62%" },
  { label: "Queijos maturados", to: "/produtos?categoria=queijos-maturados", image: "/images/products/canastra-real-curado.jpg" },
  { label: "Manteigas", to: "/produtos?categoria=manteigas-derivados", image: "/images/products/manteiga-de-cultivo.jpg" },
  { label: "Doce de leite", to: "/produtos?categoria=doce-de-leite", image: "/images/products/doce-de-leite-cremoso.jpg" },
  { label: "Premiados", to: "/produtos?premiados=1", image: "/images/products/queijo-azul-da-mantiqueira.jpg" },
  { label: "Atacado", to: "/atacado", image: "/images/site/rota-serra.jpg" },
];

function slidesFrom(data: HomeData | null): Slide[] {
  const lot = data?.lotOfTheWeek;
  return [
    {
      id: "serra", image: "/images/site/hero-mesa.jpg", alt: "Mesa posta com queijos, pão, manteiga e doce de leite diante de uma janela com vista para as montanhas",
      kicker: "Direto da serra", title: "Laticínios artesanais na sua mesa", text: "Queijos, manteigas e doces de pequenos produtores de Minas, com entrega refrigerada.",
      cta: "Ver produtos", to: "/produtos",
    },
    {
      id: "premiados", image: "/images/products/canastra-real-curado.jpg", alt: "Fatia de queijo Canastra curado sobre tábua de madeira",
      kicker: "Premiados", title: "Queijos medalhados no Mondial e no Queijo Brasil", text: "Seleção de curados que conquistaram o júri.",
      cta: "Ver premiados", to: "/produtos?premiados=1",
    },
    ...(lot ? [{
      id: "lote", image: lot.imageUrl ?? "/images/site/dona-nair.jpg", alt: `${lot.ownerName ?? "Produtora"} com o queijo do lote da semana`,
      kicker: "Lote da semana", title: lot.title, text: `${lot.city}, ${lot.state}${lot.cureDays ? ` · ${lot.cureDays} dias de cura` : ""}. Quantidade limitada.`,
      cta: "Comprar agora", to: `/produtos/${lot.productSlug}`,
    }] : []),
  ];
}

const merge = (...lists: (ProductList | null)[]) => (lists.every(Boolean) ? lists.flatMap((l) => l!.items) : null);

export function useHome() {
  return useApi<HomeData>("/home");
}

export function HomePage() {
  const { data } = useHome();
  const best = useApi<ProductList>("/products?sort=best_sellers&pageSize=12");
  const matured = useApi<ProductList>("/products?category=queijos-maturados&sort=best_sellers&pageSize=12");
  const fresh = useApi<ProductList>("/products?category=queijos-frescos&sort=best_sellers&pageSize=12");
  const sweets = useApi<ProductList>("/products?category=doce-de-leite&sort=best_sellers&pageSize=12");
  const butter = useApi<ProductList>("/products?category=manteigas-derivados&sort=best_sellers&pageSize=12");
  useEffect(() => { document.title = "Encantos da Serra · Laticínios artesanais da serra"; }, []);

  return (
    <>
      <h1 className="sr-only">Encantos da Serra: laticínios artesanais da serra</h1>
      <div className="container shop-top">
        <HeroBanner slides={slidesFrom(data)} />
        <div className="promo-stack">
          <Link to="/#entrega" className="promo promo-green">
            <Icon name="snowflake" />
            <span><strong>Entrega refrigerada</strong><small>Veja o frete e o dia de entrega no seu CEP</small></span>
          </Link>
          <Link to="/atacado" className="promo promo-gold">
            <Icon name="building" />
            <span><strong>Compra para empresa?</strong><small>Preço por volume e nota fiscal</small></span>
          </Link>
        </div>
      </div>

      <nav className="container shortcuts" aria-label="Categorias">
        {SHORTCUTS.map((s) => (
          <Link key={s.label} to={s.to} className="shortcut">
            <span className="shortcut-img"><img src={s.image} alt="" loading="lazy" style={s.position ? { objectPosition: s.position, transform: "scale(2.2)", transformOrigin: s.position } : undefined} /></span>
            <span>{s.label}</span>
          </Link>
        ))}
      </nav>

      <div className="container rails">
        <ProductRail id="mais-vendidos" title="Mais vendidos" href="/produtos?ordem=best_sellers" products={best.data?.items ?? null} />
        <ProductRail id="queijos" title="Queijos da serra" href="/produtos?categoria=queijos-maturados" products={merge(matured.data, fresh.data)} />
        <ProductRail id="doces" title="Doce de leite e manteiga" href="/produtos?categoria=doce-de-leite" products={merge(sweets.data, butter.data)} />
      </div>

      <section className="section-tight section-alt" id="entrega" aria-labelledby="entrega-titulo">
        <div className="container delivery">
          <div>
            <h2 id="entrega-titulo">Entregamos na sua região?</h2>
            <p>Digite seu CEP para ver o frete e o próximo dia de entrega.</p>
          </div>
          <CepLookup />
        </div>
      </section>
    </>
  );
}
