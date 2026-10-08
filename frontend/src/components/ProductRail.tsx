import { useCallback, useEffect, useRef, useState } from "react";
import type { Product } from "../api";
import { Icon } from "../icons";
import { Link } from "../router";
import { ProductCard } from "./ProductCard";

// Vitrine horizontal: rola com toque/trackpad e tem setas quando há mais itens do que cabem.
export function ProductRail({ id, title, href, products }: { id: string; title: string; href: string; products: Product[] | null }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    update();
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, products]);

  const scroll = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <section className="rail" aria-labelledby={id}>
      <div className="rail-head">
        <h2 id={id}>{title}</h2>
        <div className="rail-actions">
          <Link to={href} className="link">Ver tudo</Link>
          {!(edges.start && edges.end) && (
            <>
              <button className="rail-btn" onClick={() => scroll(-1)} disabled={edges.start} aria-label={`Rolar ${title} para a esquerda`}><Icon name="arrowRight" className="icon-sm flip" /></button>
              <button className="rail-btn" onClick={() => scroll(1)} disabled={edges.end} aria-label={`Rolar ${title} para a direita`}><Icon name="arrowRight" className="icon-sm" /></button>
            </>
          )}
        </div>
      </div>
      <div className="rail-track" ref={track} onScroll={update}>
        {products
          ? products.map((p) => <div key={p.id} className="rail-item"><ProductCard product={p} /></div>)
          : Array.from({ length: 5 }, (_, i) => <div key={i} className="rail-item skeleton" style={{ aspectRatio: ".62" }} />)}
      </div>
    </section>
  );
}
