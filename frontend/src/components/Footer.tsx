import { BrandMark, Icon } from "../icons";
import { Link } from "../router";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link to="/" className="brand" aria-label="Encantos da Serra, página inicial">
              <span className="brand-mark"><BrandMark /></span>
              <span><span className="brand-name">Encantos</span><span className="brand-sub">da Serra</span></span>
            </Link>
            <p className="footer-claim">Da mão de quem produz com cuidado para a mesa de quem valoriza a origem.</p>
            {/* Contatos do protótipo — fictícios, por isso não viram links clicáveis. */}
            <div className="footer-contacts">
              <span><Icon name="chat" className="icon-sm" />WhatsApp: (37) 99812-4470</span>
              <span><Icon name="mail" className="icon-sm" />contato@encantosdaserra.com.br</span>
            </div>
          </div>
          <nav aria-labelledby="footer-comprar">
            <h2 id="footer-comprar">Comprar</h2>
            <ul>
              <li><Link to="/produtos">Todos os produtos</Link></li>
              <li><Link to="/rastrear">Rastrear pedido</Link></li>
              <li><Link to="/pedidos">Meus pedidos</Link></li>
              <li><Link to="/carrinho">Carrinho</Link></li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-empresa">
            <h2 id="footer-empresa">Encantos da Serra</h2>
            <ul>
              <li><Link to="/nossa-historia">Nossa história</Link></li>
              <li><Link to="/atacado">Atacado para empresas</Link></li>
              <li><Link to="/produtores">Seja um produtor parceiro</Link></li>
            </ul>
          </nav>
        </div>
        <div className="footer-copy">
          <span>© {new Date().getFullYear()} Encantos da Serra. Feito em Minas, com respeito à origem.</span>
          <span>Projeto de estudos · dados fictícios · <Link to="/admin">Painel de gestão</Link></span>
        </div>
      </div>
    </footer>
  );
}
