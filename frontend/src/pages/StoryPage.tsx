import { useEffect } from "react";
import { Icon, type IconName } from "../icons";
import { Link } from "../router";
import { useHome } from "./Home";

export function StoryPage() {
  const { data } = useHome();
  const t = data?.trust;
  useEffect(() => { document.title = "Nossa história · Encantos da Serra"; }, []);

  const facts: { icon: IconName; title: string; text: string }[] = [
    { icon: "snowflake", title: `Refrigerado de ${t?.coldChainRange.minC ?? 2} a ${t?.coldChainRange.maxC ?? 8} °C`, text: "Da coleta na fazenda até a sua porta, com temperatura monitorada." },
    { icon: "scan", title: "Origem de cada peça", text: "Produtor, lote e data de produção aparecem no seu pedido." },
    { icon: "shield", title: "Selos sanitários", text: "SIF, SIM, SIE ou Selo Arte, conforme o produto." },
  ];

  return (
    <>
      <section className="section">
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
            <h1 className="story-title">Da mão de quem produz para a sua mesa.</h1>
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
            <Link to="/produtos" className="btn btn-primary btn-lg" style={{ marginTop: 32 }}>Conhecer os produtos <Icon name="arrowRight" /></Link>
          </div>
        </div>
      </section>

      <section className="section section-alt" aria-label="Para empresas e produtores">
        <div className="container audiences">
          <article className="card audience">
            <span className="kicker">Para empresas</span>
            <h2>Abasteça seu empório ou restaurante</h2>
            <p>Preço por volume, nota fiscal e entrega refrigerada programada.</p>
            <Link to="/atacado" className="link">Conhecer o atacado <Icon name="arrowRight" className="icon-sm" /></Link>
          </article>
          <article className="card audience dark on-dark">
            <span className="kicker">Para produtores</span>
            <h2>Leve sua produção mais longe</h2>
            <p>Coleta na propriedade, pagamento em dia e acesso a novos compradores.</p>
            <Link to="/produtores" className="link">Quero ser parceiro <Icon name="arrowRight" className="icon-sm" /></Link>
          </article>
        </div>
      </section>
    </>
  );
}
