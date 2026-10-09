import { useEffect } from "react";
import { AdminApp } from "./admin/AdminApp";
import { CookieBanner, Toasts } from "./components/Chrome";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { AuthPage } from "./pages/AuthPage";
import { CartPage } from "./pages/CartPage";
import { CatalogPage } from "./pages/Catalog";
import { HomePage } from "./pages/Home";
import { OrderDetailPage, OrdersPage, TrackPage } from "./pages/OrdersPage";
import { ProducersPage } from "./pages/ProducersPage";
import { ProductPage } from "./pages/ProductPage";
import { StoryPage } from "./pages/StoryPage";
import { WholesalePage } from "./pages/WholesalePage";
import { Link, matchPath, RouterProvider, useLocation } from "./router";
import { StoreProvider } from "./store";

function NotFound() {
  return (
    <div className="container empty" style={{ padding: "96px 16px" }}>
      <h3>Página não encontrada</h3>
      <p>O caminho pode ter mudado.</p>
      <Link to="/" className="btn btn-primary">Voltar ao início</Link>
    </div>
  );
}

function Routes() {
  const { pathname, hash } = useLocation();

  // Rola até a âncora (#pedido-rapido, #proposta…) depois que a página monta.
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 80);
    return () => clearTimeout(t);
  }, [pathname, hash]);

  if (pathname === "/") return <HomePage />;
  if (pathname === "/produtos") return <CatalogPage />;
  const product = matchPath("/produtos/:slug", pathname);
  if (product) return <ProductPage slug={product.slug!} />;
  if (pathname === "/carrinho") return <CartPage />;
  if (pathname === "/entrar") return <AuthPage />;
  if (pathname === "/pedidos") return <OrdersPage />;
  const order = matchPath("/pedidos/:code", pathname);
  if (order) return <OrderDetailPage code={order.code!} />;
  if (pathname === "/rastrear") return <TrackPage />;
  if (pathname === "/atacado") return <WholesalePage />;
  if (pathname === "/produtores") return <ProducersPage />;
  if (pathname === "/nossa-historia") return <StoryPage />;
  return <NotFound />;
}

function Shell() {
  const { pathname } = useLocation();
  // O painel tem layout próprio, sem cabeçalho/rodapé da loja.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return (
      <>
        <AdminApp />
        <Toasts />
      </>
    );
  }
  return (
    <>
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <Header />
      <main id="conteudo" tabIndex={-1}><Routes /></main>
      <Footer />
      <Toasts />
      <CookieBanner />
    </>
  );
}

export function App() {
  return (
    <RouterProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </RouterProvider>
  );
}
