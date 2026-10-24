// Piezas compartidas del grupo G3 (caja, productos, comisiones, packs y clientes).
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { appApi } from "../../config";
import { Field, numOrNull } from "../ui";
import "../../g3.css";

export const METHOD_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo", DEBITO: "Débito", CREDITO: "Crédito", TRANSFERENCIA: "Transferencia", MERCADOPAGO: "Mercado Pago",
  QR: "QR", SALDO_A_FAVOR: "Saldo a favor", PACK: "Pack o membresía", OTRO: "Otro",
};
/** Medios que se pueden cargar a mano al cobrar (el pack se aplica sobre el ítem, no como pago) */
export const PAY_METHODS = ["EFECTIVO", "DEBITO", "CREDITO", "TRANSFERENCIA", "MERCADOPAGO", "QR", "SALDO_A_FAVOR", "OTRO"];
export const mlabel = (m: string) => METHOD_LABELS[m] || m;

export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const shiftDay = (key: string, n: number) => {
  const d = new Date(key + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const dmy = (v?: string | null) => (v ? new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString("es-AR") : "—");
export const hm = (v?: string | null) => (v ? new Date(v).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—");
export const dmyhm = (v?: string | null) => (v ? `${dmy(v)} ${hm(v)}` : "—");
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Ocurrió un error");

export function waUrl(phoneWa: string | null | undefined, text: string): string | null {
  return phoneWa ? `https://wa.me/${phoneWa}?text=${encodeURIComponent(text)}` : null;
}

export function WaButton({ phoneWa, text, label = "WhatsApp" }: { phoneWa?: string | null; text: string; label?: string }) {
  const url = waUrl(phoneWa, text);
  if (!url) return <button type="button" className="secondary-button g3-small" disabled title="Falta un teléfono válido para armar el WhatsApp">{label}</button>;
  return <a className="secondary-button g3-small g3-link-btn" href={url} target="_blank" rel="noopener noreferrer">{label}</a>;
}

/** Carga un GET y permite recargarlo. Ignora respuestas viejas si el pedido cambió. */
export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!path);
  const seq = useRef<number>(0);
  const reload = useCallback(() => {
    const my = (seq.current ?? 0) + 1;
    seq.current = my;
    if (!path) { setData(null); setLoading(false); return Promise.resolve(); }
    setLoading(true);
    return appApi<T>(path)
      .then((d) => { if (my === seq.current) { setData(d); setError(""); } })
      .catch((e) => { if (my === seq.current) setError(errMsg(e)); })
      .finally(() => { if (my === seq.current) setLoading(false); });
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Número controlado por texto (coma o punto) */
export function NumInput({ value, onChange, id, ariaLabel, placeholder, className, autoFocus, disabled }: {
  value: number | null | undefined; onChange: (n: number | null) => void; id?: string; ariaLabel?: string; placeholder?: string;
  className?: string; autoFocus?: boolean; disabled?: boolean;
}) {
  const show = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
  const [text, setText] = useState(show(value));
  useEffect(() => { if (numOrNull(text) !== (value ?? null)) setText(show(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input id={id} inputMode="decimal" aria-label={ariaLabel} placeholder={placeholder} className={className} autoFocus={autoFocus} disabled={disabled}
      value={text} onChange={(e) => { setText(e.target.value); onChange(numOrNull(e.target.value)); }} />
  );
}

export function PinField({ value, onChange, what }: { value: string; onChange: (v: string) => void; what: string }) {
  return (
    <Field label="PIN de un encargado" hint={`Tu rol necesita la autorización de un encargado para ${what}.`}>
      <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} />
    </Field>
  );
}

export interface CustLite { id: number; name: string; phone?: string | null; phone_wa?: string | null; health_alert?: boolean; no_show_count?: number; require_deposit?: boolean }

/** Buscador de cliente por nombre, teléfono o DNI */
export function CustomerPicker({ value, onChange, label = "Cliente", hint }: {
  value: CustLite | null; onChange: (c: CustLite | null) => void; label?: string; hint?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CustLite[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return; }
    setBusy(true);
    const t = window.setTimeout(() => {
      appApi<CustLite[]>(`/customers/search?q=${encodeURIComponent(q.trim())}`).then(setRows).catch(() => setRows([])).finally(() => setBusy(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);
  if (value) {
    return (
      <Field label={label} hint={hint}>
        <div className="g3-picked">
          <span><strong>{value.name}</strong>{value.phone && <small>{value.phone}</small>}</span>
          <button type="button" className="tn-link-button" onClick={() => { onChange(null); setQ(""); }}>Cambiar</button>
        </div>
      </Field>
    );
  }
  return (
    <Field label={label} hint={hint}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscá por nombre, teléfono o DNI" aria-label={label} />
      {q.trim().length >= 2 && (
        <div className="g3-results" role="listbox">
          {busy && <small className="tn-muted g3-pad">Buscando...</small>}
          {!busy && rows.length === 0 && <small className="tn-muted g3-pad">No encontramos a nadie con eso.</small>}
          {rows.map((c) => (
            <button type="button" key={c.id} role="option" aria-selected={false} onClick={() => { onChange(c); setQ(""); setRows([]); }}>
              <strong>{c.name}</strong><small>{c.phone || "sin teléfono"}</small>
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}

export function Kpi({ label, value, hint, tone, onClick }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warn" | "alert"; onClick?: () => void }) {
  const inner = <><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</>;
  const cls = `tn-kpi ${tone ? "is-" + tone : ""}`;
  return onClick ? <button type="button" className={cls} onClick={onClick}>{inner}</button> : <div className={cls}>{inner}</div>;
}

export function ErrorNote({ text }: { text: string }) {
  return text ? <div className="tn-note tn-note-error" role="alert">{text}</div> : null;
}

/** Cantidad con signo para movimientos */
export const signed = (n: number) => (n > 0 ? "+" : "") + n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
