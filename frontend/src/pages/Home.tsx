import { useEffect } from "react";
import { type Home as HomeData } from "../api";
import { CepLookup } from "../components/CepLookup";
import { ProductCard, ProductSkeletons } from "../components/ProductCard";
import { Icon, type IconName } from "../icons";
import { Link } from "../router";
import { useApi } from "../store";

// A API não manda foto de categoria; usamos um produto representativo de cada uma.
const CATEGORY_IMAGE: Record<string, string> = {
  "queijos-frescos": "/images/products/queijo-minas-frescal.jpg",
  "queijos-maturados": "/images/products/canastra-real-curado.jpg",
  "manteigas-derivados": "/images/products/manteiga-de-cultivo.jpg",
  "doce-de-leite": "/images/products/doce-de-leite-cremoso.jpg",
};

function Hero({ data }: { data: HomeData | null }) {
  const lot = data?.lotOfTheWeek;
  return (
    <section className="hero">
      <div className="container hero-grid">
        <div>
          <h1>Laticínios artesanais da serra, direto para a sua mesa.</h1>
          <p className="hero-lead">Queijos, manteigas e doces de leite de pequenos produtores de Minas, com entrega refrigerada.</p>
          <div className="hero-ctas">
            <Link to="/produtos" className="btn btn-primary btn-lg">Ver produtos <Icon name="arrowRight" /></Link>
            <Link to="/atacado" className="link">Compra para empresa? Conheça o atacado</Link>
          </div>
        </div>
        <div className="hero-media">
          <img src="/images/site/hero-mesa.jpg" alt="Mesa posta com queijos, pão, manteiga e doce de leite diante de uma janela com vista para as montanhas" />
          {lot && (
            <Link to={`/produtos/${lot.productSlug}`} className="lot-card">
              <img src={lot.producerImageUrl ?? lot.imageUrl ?? "/images/site/dona-nair.jpg"} alt="" />
              <span>
                <span className="kicker">Lote da semana</span>
                <strong>{lot.title}</strong>
                <small>{lot.city}{lot.cureDays ? ` · ${lot.cureDays} dias de cura` : ""}</small>
              </span>
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function Categories({ data }: { data: HomeData | null }) {
  const categories = (data?.categories ?? []).filter((c) => CATEGORY_IMAGE[c.slug]);
  return (
    <section className="section" style={{ paddingTop: 0 }} aria-labelledby="categorias">
      <div className="container">
        <div className="section-head"><h2 id="categorias">Comprar por categoria</h2></div>
        <div className="cat-grid">
          {categories.map((c) => (
            <Link key={c.slug} to={c.href} className="cat-card">
              <div className="cat-img"><img src={CATEGORY_IMAGE[c.slug]} alt="" loading="lazy" /></div>
              <h3>{c.name}</h3>
              <p>{c.description}</p>
            </Link>
          ))}
          {!data && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ aspectRatio: ".8" }} />)}
        </div>
      </div>
    </section>
  );
}

function BestSellers({ data }: { data: HomeData | null }) {
  return (
    <section className="section section-alt" aria-labelledby="mais-pedidos">
      <div className="container">
        <div className="section-head">
          <h2 id="mais-pedidos">Mais pedidos</h2>
          <Link to="/produtos" className="link">Ver todos os produtos</Link>
        </div>
        <div className="product-grid">
          {data ? data.highlights.items.map((p) => <ProductCard key={p.id} product={p} />) : <ProductSkeletons />}
        </div>
      </div>
    </section>
  );
}

function Story({ data }: { data: HomeData | null }) {
  const t = data?.trust;
  const facts: { icon: IconName; title: string; text: string }[] = [
    { icon: "snowflake", title: `Refrigerado de ${t?.coldChainRange.minC ?? 2} a ${t?.coldChainRange.maxC ?? 8} °C`, text: "Da coleta na fazenda até a sua porta, com temperatura monitorada." },
    { icon: "scan", title: "Origem de cada peça", text: "Produtor, lote e data de produção aparecem no seu pedido." },
    { icon: "shield", title: "Selos sanitários", text: "SIF, SIM, SIE ou Selo Arte, conforme o produto." },
  ];
  return (
    <section className="section" id="historia" aria-labelledby="historia-titulo">
      <div className="container story">
        <div>
          <div className="story-media">
            <img src="/images/site/produtores-maria-jose.jpg" alt="Maria e José, produtores parceiros, segurando um queijo em frente à queijaria" />
          </div>
          <blockquote className="story-quote">
            “Hoje produzimos com tranquilidade porque sabemos quando será a coleta e quando vamos receber.”
            <footer>Maria e José, Sítio Boa Vista</footer>
          </blockquote>
        </div>
        <div>
          <span className="eyebrow">Nossa história</span>
          <h2 id="historia-titulo">Da mão de quem produz para a sua mesa.</h2>
          <p>
            Trabalhamos direto com mais de {t?.partnerProducers ?? 120} famílias produtoras em {data?.producerProgram.municipalities ?? 62} municípios
            da serra. Menos intermediários, mais frescor e um preço justo para quem faz.
          </p>
          <ul className="facts">
            {facts.map((f) => (
              <li key={f.title}>
                <span className="icon-circle"><Icon name={f.icon} className="icon-sm" /></span>
                <div><strong>{f.title}</strong><span>{f.text}</span></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Delivery() {
  return (
    <section className="section-tight section-alt" aria-labelledby="entrega">
      <div className="container delivery">
        <div>
          <h2 id="entrega">Entregamos na sua região?</h2>
          <p>Digite seu CEP para ver o frete e o próximo dia de entrega.</p>
        </div>
        <CepLookup />
      </div>
    </section>
  );
}

function Audiences() {
  return (
    <section className="section" aria-label="Para empresas e produtores">
      <div className="container audiences">
        <article className="card audience">
          <span className="kicker">Para empresas</span>
          <h3>Abasteça seu empório ou restaurante</h3>
          <p>Preço por volume, nota fiscal e entrega refrigerada programada.</p>
          <Link to="/atacado" className="link">Conhecer o atacado <Icon name="arrowRight" className="icon-sm" /></Link>
        </article>
        <article className="card audience dark on-dark">
          <span className="kicker">Para produtores</span>
          <h3>Leve sua produção mais longe</h3>
          <p>Coleta na propriedade, pagamento em dia e acesso a novos compradores.</p>
          <Link to="/produtores" className="link">Quero ser parceiro <Icon name="arrowRight" className="icon-sm" /></Link>
        </article>
      </div>
    </section>
  );
}

export function useHome() {
  return useApi<HomeData>("/home");
}

export function HomePage() {
  const { data } = useHome();
  useEffect(() => { document.title = "Encantos da Serra · Laticínios artesanais da serra"; }, []);
  return (
    <>
      <Hero data={data} />
      <Categories data={data} />
      <BestSellers data={data} />
      <Story data={data} />
      <Delivery />
      <Audiences />
    </>
  );
}
