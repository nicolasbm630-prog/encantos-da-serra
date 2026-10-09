import { useEffect } from "react";
import { BrandMark, Icon } from "../icons";
import { Link, navigate, useLocation } from "../router";
import { useApi, useStore } from "../store";
import { InventoryPage } from "./InventoryPage";
import { OrdersPage } from "./OrdersPage";

const TABS = [
  { to: "/admin", label: "Pedidos", icon: "receipt" as const },
  { to: "/admin/estoque", label: "Estoque", icon: "boxes" as const },
];

export function AdminApp() {
  const { pathname } = useLocation();
  const { user, ready, logout } = useStore();
  // Enquanto o acesso não estiver configurado, o backend pode liberar o painel (ADMIN_AUTH_DISABLED).
  const access = useApi<{ open: boolean }>("/admin/access");
  const isOpen = access.data?.open ?? false;

  useEffect(() => {
    document.title = `${pathname.startsWith("/admin/estoque") ? "Estoque" : "Pedidos"} · Painel Encantos`;
  }, [pathname]);

  if (!ready || access.loading) return <div className="adm-loading"><Icon name="loader" className="icon spin" /></div>;

  if (!isOpen && (!user || user.role !== "admin")) {
    return (
      <div className="adm-guard">
        <span className="brand-mark"><BrandMark /></span>
        <h1>Painel restrito</h1>
        <p>{user ? "Sua conta não tem acesso de administrador." : "Entre com uma conta de administrador para ver pedidos e estoque."}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {!user && <Link to="/entrar?next=/admin" className="btn btn-primary">Entrar</Link>}
          <Link to="/" className="btn btn-outline">Voltar à loja</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="adm">
      <header className="adm-top">
        <div className="adm-wrap adm-top-row">
          <Link to="/admin" className="adm-brand">
            <span className="brand-mark"><BrandMark size={18} /></span>
            <span>Encantos <small>Painel</small></span>
          </Link>
          <nav className="adm-tabs" aria-label="Seções do painel">
            {TABS.map((t) => {
              const active = t.to === "/admin" ? pathname === "/admin" : pathname.startsWith(t.to);
              return (
                <Link key={t.to} to={t.to} className="adm-tab" aria-current={active ? "page" : undefined}>
                  <Icon name={t.icon} className="icon-sm" />{t.label}
                </Link>
              );
            })}
          </nav>
          <div className="adm-user">
            <Link to="/" className="adm-link"><Icon name="store" className="icon-sm" /><span>Ver loja</span></Link>
            {isOpen && <span className="adm-open-pill" title="ADMIN_AUTH_DISABLED=true no backend/.env">Acesso livre</span>}
            {user && (
              <>
                <span className="adm-avatar" title={user.email}>{user.name.slice(0, 1)}</span>
                <button className="adm-icon-btn on-dark" aria-label="Sair" onClick={() => { logout(); navigate("/"); }}><Icon name="logout" className="icon-sm" /></button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="adm-wrap adm-main">
        {pathname.startsWith("/admin/estoque") ? <InventoryPage /> : <OrdersPage />}
      </main>
    </div>
  );
}
