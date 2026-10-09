import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "../icons";

// Diálogo modal nativo (<dialog>): foco preso, Esc fecha, fundo escurecido.
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`adm-dialog ${wide ? "wide" : ""}`} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="adm-dialog-head">
        <h2>{title}</h2>
        <button className="adm-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" className="icon-sm" /></button>
      </div>
      {open && children}
    </dialog>
  );
}
