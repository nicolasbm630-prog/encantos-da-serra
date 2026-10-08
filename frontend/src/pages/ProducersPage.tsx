import { useEffect } from "react";
import { ProposalWizard } from "../components/ProposalWizard";
import { Icon, type IconName } from "../icons";
import { useHome } from "./Home";

const BENEFITS: { icon: IconName; title: string; text: string }[] = [
  { icon: "dollar", title: "Pagamento garantido", text: "Calendário claro e repasse conferido lote a lote." },
  { icon: "truck", title: "Coleta na propriedade", text: "Rota refrigerada combinada com antecedência." },
  { icon: "trending", title: "Preço justo e novos mercados", text: "Sua origem em destaque para compradores de todo o Sudeste." },
];

export function ProducersPage() {
  const { data } = useHome();
  const program = data?.producerProgram;
  useEffect(() => { document.title = "Seja um produtor parceiro · Encantos da Serra"; }, []);
  return (
    <>
      <section className="section">
        <div className="container partner-grid">
          <div className="partner-media">
            <img src="/images/site/produtores-maria-jose.jpg" alt="Maria e José, produtores parceiros há 6 anos, segurando um queijo em frente à queijaria" />
          </div>
          <div className="partner">
            <span className="eyebrow">Para produtores</span>
            <h1 className="serif" style={{ fontSize: "clamp(32px, 4vw, 48px)", lineHeight: 1.1, margin: "12px 0 16px" }}>Sua produção valorizada, do sítio à mesa.</h1>
            <p>Você cuida do sabor e da tradição. Nós levamos seu produto a novos mercados, com previsibilidade e suporte.</p>
            <ul className="facts">
              {BENEFITS.map((b) => (
                <li key={b.title}>
                  <span className="icon-circle gold"><Icon name={b.icon} className="icon-sm" /></span>
                  <div><strong>{b.title}</strong><span>{b.text}</span></div>
                </li>
              ))}
            </ul>
            <a href="#proposta" className="btn btn-primary btn-lg">Enviar minha proposta <Icon name="arrowRight" /></a>
            <div className="partner-stats">
              <div><b>{program?.onTimePickupPct ?? 98}%</b><span>coletas no prazo</span></div>
              <div><b>{program?.averagePaymentDays ?? 7} dias</b><span>prazo médio de pagamento</span></div>
              <div><b>{program?.municipalities ?? 62}</b><span>municípios parceiros</span></div>
            </div>
          </div>
        </div>
      </section>
      <section className="section section-alt" id="proposta" aria-labelledby="proposta-titulo">
        <div className="container">
          <div className="section-head">
            <div>
              <h2 id="proposta-titulo">Envie sua proposta em 3 etapas</h2>
              <p>Conte sobre sua produção e anexe os documentos que tiver. Leva cerca de 8 minutos.</p>
            </div>
          </div>
          <ProposalWizard />
        </div>
      </section>
    </>
  );
}
