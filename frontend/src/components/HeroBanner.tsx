import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { Link } from "../router";

export type Slide = { id: string; image: string; alt: string; kicker: string; title: string; text: string; cta: string; to: string };

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Banner rotativo: troca sozinho a cada 6 s, pausa com mouse/foco e para de vez quando a pessoa usa as setas ou bolinhas.
export function HeroBanner({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => !reducedMotion());
  const [hold, setHold] = useState(false);
  const count = slides.length;

  useEffect(() => { if (index >= count) setIndex(0); }, [count, index]);
  useEffect(() => {
    if (!playing || hold || count < 2) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearTimeout(t);
  }, [playing, hold, index, count]);

  const go = (i: number) => { setPlaying(false); setIndex((i + count) % count); };

  return (
    <section className="banner" aria-roledescription="carrossel" aria-label="Destaques"
      onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHold(false); }}>
      <div className="banner-track" aria-live={playing && !hold ? "off" : "polite"}>
        {slides.map((s, i) => (
          <div key={s.id} className="banner-slide" data-active={i === index} aria-hidden={i !== index}
            role="group" aria-roledescription="slide" aria-label={`${i + 1} de ${count}`}>
            <img src={s.image} alt={s.alt} />
            <div className="banner-copy">
              <span className="banner-kicker">{s.kicker}</span>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
              <Link to={s.to} className="btn btn-gold btn-lg" tabIndex={i === index ? 0 : -1}>{s.cta} <Icon name="arrowRight" /></Link>
            </div>
          </div>
        ))}
      </div>
      {count > 1 && (
        <div className="banner-controls">
          <button className="banner-btn" onClick={() => go(index - 1)} aria-label="Destaque anterior"><Icon name="arrowRight" className="icon-sm flip" /></button>
          <div className="banner-dots">
            {slides.map((s, i) => (
              <button key={s.id} aria-label={`Ir para o destaque ${i + 1}`} aria-current={i === index} onClick={() => go(i)} />
            ))}
          </div>
          <button className="banner-btn" onClick={() => go(index + 1)} aria-label="Próximo destaque"><Icon name="arrowRight" className="icon-sm" /></button>
        </div>
      )}
    </section>
  );
}
