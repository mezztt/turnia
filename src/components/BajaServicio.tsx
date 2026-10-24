import { useCallback, useEffect, useState } from "react";
import { APP_BRAND, APP_NAME, appApi, dateTime } from "../config";
import { Modal, Pill } from "./ui";

/** Baja del SERVICIO de Mezztt (Disposición 954/2025): botón del administrador, confirmación en dos pasos, constancia BAJA-SRV-AAAA-NNNN. */
interface BajaRow { code: string; status: string; created_at: string; service_end_date: string | null; withdrawn_at: string | null }
interface BajaState {
  active: boolean; code: string | null; requested_at: string | null; service_end_date: string | null; preview_end_date: string;
  company_name: string; notes: string[]; history: BajaRow[];
}
const CHANGED = "baja-servicio-changed";
const EP = "/service-cancellation";
const day = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const STATUS: Record<string, string> = { SOLICITADA: "Pedida", RETIRADA: "Retirada", EJECUTADA: "Terminó el servicio", REACTIVADA: "Reactivada por Mezztt", PENDIENTE: "Pedido sin sesión", ATENDIDA: "Atendido" };

function useBaja() {
  const [st, setSt] = useState<BajaState | null>(null);
  const load = useCallback(() => { appApi<BajaState>(EP).then(setSt).catch(() => setSt(null)); }, []);
  useEffect(() => { load(); window.addEventListener(CHANGED, load); return () => window.removeEventListener(CHANGED, load); }, [load]);
  return { st, setSt, load };
}

function constanciaText(st: BajaState): string {
  return [`Constancia de baja del servicio ${APP_NAME} (${APP_BRAND})`, `Código: ${st.code}`, `Empresa: ${st.company_name}`,
    `Fecha y hora del pedido: ${dateTime(st.requested_at)}`, `El servicio sigue funcionando hasta el ${day(st.service_end_date)} (fin del período pagado).`,
    "No se hacen cobros nuevos. Tus datos se conservan. Disposición 954/2025."].join("\n");
}

function printConstancia(st: BajaState) {
  const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument, win = frame.contentWindow;
  if (!doc || !win) { frame.remove(); return; }
  doc.open();
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(String(st.code))}</title><style>
    @page { margin: 18mm; } body { font: 14px/1.5 Arial, sans-serif; color: #000; background: #fff; max-width: 150mm; }
    h1 { font-size: 20px; margin: 0 0 4px; } .code { font-size: 26px; font-weight: 700; letter-spacing: .5px; margin: 14px 0; border: 2px solid #000; padding: 8px 12px; display: inline-block; }
    p { margin: 6px 0; } .small { font-size: 12px; margin-top: 18px; }
  </style></head><body><h1>Constancia de baja del servicio</h1><p>${esc(APP_NAME)} · ${esc(APP_BRAND)}</p>
  <div class="code">${esc(String(st.code))}</div>
  <p><b>Empresa:</b> ${esc(st.company_name)}</p><p><b>Fecha y hora del pedido:</b> ${esc(dateTime(st.requested_at))}</p>
  <p><b>El servicio sigue funcionando hasta el:</b> ${esc(day(st.service_end_date))} (fin del período ya pagado).</p>
  ${st.notes.map((n) => `<p>${esc(n)}</p>`).join("")}
  <p>No se hacen cobros nuevos después de la baja. Tus datos se conservan. Podés retirar la baja antes de esa fecha desde Configuración.</p>
  <p class="small">Baja del servicio según la Disposición 954/2025. Documento no válido como factura.</p></body></html>`);
  doc.close();
  win.onafterprint = () => window.setTimeout(() => frame.remove(), 300);
  window.setTimeout(() => { win.focus(); win.print(); window.setTimeout(() => frame.remove(), 60000); }, 150);
}

function Constancia({ st, onClose }: { st: BajaState; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(constanciaText(st)); setCopied(true); window.setTimeout(() => setCopied(false), 2500); }
    catch { window.prompt("Copiá la constancia:", constanciaText(st)); }
  }
  return (
    <Modal eyebrow="BAJA DEL SERVICIO" title="Listo, quedó registrada tu baja" onClose={onClose}
      footer={<><button className="secondary-button" onClick={copy}>{copied ? "Copiado" : "Copiar"}</button>
        <button className="secondary-button" onClick={() => printConstancia(st)}>Imprimir</button>
        <button className="primary-button" onClick={onClose}>Cerrar</button></>}>
    <div className="product-form" data-testid="baja-constancia">
      <p className="tn-muted">Guardá esta constancia. Es tu comprobante de que pediste la baja.</p>
      <p style={{ fontSize: 24, fontWeight: 800, margin: "4px 0" }}>{st.code}</p>
      <p>{st.company_name} · {dateTime(st.requested_at)}</p>
      <div className="tn-note tn-note-info"><strong>Seguís usando {APP_NAME} hasta el {day(st.service_end_date)}</strong>, el último día del período que ya pagaste. No se hacen cobros nuevos y tus datos se conservan.</div>
      {st.notes.map((n) => <div key={n} className="tn-note tn-note-warn">{n}</div>)}
      <p className="tn-muted">Si cambiás de idea, podés retirar la baja antes de esa fecha.</p>
    </div></Modal>
  );
}

export function BajaServicioCard() {
  const { st, setSt } = useBaja();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true); setError("");
    try { setSt(await appApi<BajaState>(EP, { method: "POST", body: { confirm: true } })); setStep(3); window.dispatchEvent(new Event(CHANGED)); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo registrar la baja"); } finally { setBusy(false); }
  }
  async function withdraw() {
    setBusy(true); setError("");
    try { setSt(await appApi<BajaState>(`${EP}/withdraw`, { method: "POST", body: {} })); window.dispatchEvent(new Event(CHANGED)); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo retirar la baja"); } finally { setBusy(false); }
  }
  if (!st) return null;
  const end = day(st.active ? st.service_end_date : st.preview_end_date);
  return (
    <div className="tn-card" data-testid="baja-card">
      <h2>Dar de baja el servicio</h2>
      {st.active ? (
        <>
          <div className="tn-note tn-note-warn"><strong>Baja pedida · {st.code}</strong><br />Seguís usando {APP_NAME} hasta el {end}. Después se pausa, sin borrar tus datos.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button className="secondary-button" onClick={() => setStep(3)}>Ver constancia</button>
            <button className="primary-button" onClick={withdraw} disabled={busy}>{busy ? "Un momento..." : "Retirar la baja"}</button>
          </div>
        </>
      ) : (
        <>
          <p className="tn-muted">Podés dar de baja {APP_NAME} cuando quieras, sin dar motivos ni hacer trámites. No cortamos nada de golpe: seguís usándolo hasta el {end}, que es el final de lo que ya pagaste.</p>
          <button className="tn-danger-button" onClick={() => { setError(""); setStep(1); }}>Dar de baja el servicio</button>
        </>
      )}
      {error && <div className="tn-note tn-note-error" style={{ marginTop: 10 }}>{error}</div>}
      {st.history.length > 0 && <ul className="tn-list" style={{ marginTop: 12 }}>{st.history.map((b) => (
        <li key={b.code}><div className="tn-list-main"><strong>{b.code}</strong><small>{dateTime(b.created_at)}{b.service_end_date ? ` · hasta el ${day(b.service_end_date)}` : ""}</small></div>
          <Pill tone={b.status === "SOLICITADA" ? "orange" : "gray"}>{STATUS[b.status] || b.status}</Pill></li>))}</ul>}
      {step === 1 && (
        <Modal eyebrow="BAJA DEL SERVICIO · PASO 1 DE 2" title="¿Qué pasa si das de baja el servicio?" onClose={() => setStep(0)}
          footer={<><button className="secondary-button" onClick={() => setStep(0)}>Volver</button><button className="tn-danger-button" onClick={() => setStep(2)}>Seguir</button></>}>
          <div className="product-form">
            <p>El sistema <strong>sigue funcionando hasta el {end}</strong> (fin del período ya pagado).</p>
            <p>Después se pausa. <strong>No borramos tus datos</strong> y Mezztt puede reactivarlo si volvés.</p>
            <p>No se hacen cobros nuevos. Antes de esa fecha podés <strong>retirar la baja</strong> desde acá.</p>
            {st.notes.map((n) => <div key={n} className="tn-note tn-note-info">{n}</div>)}
          </div></Modal>
      )}
      {step === 2 && (
        <Modal eyebrow="BAJA DEL SERVICIO · PASO 2 DE 2" title="Confirmá la baja" onClose={() => setStep(0)}
          footer={<><button className="secondary-button" onClick={() => setStep(1)}>Atrás</button><button className="tn-danger-button" onClick={confirm} disabled={busy}>{busy ? "Registrando..." : "Sí, dar de baja el servicio"}</button></>}>
          <div className="product-form">
            <p>Vas a dar de baja {APP_NAME} para <strong>{st.company_name}</strong>. Te damos la constancia ahora mismo.</p>
            <div className="tn-note tn-note-warn">Seguís usándolo hasta el {end}.</div>
            {error && <div className="tn-note tn-note-error">{error}</div>}
          </div></Modal>
      )}
      {step === 3 && st.active && <Constancia st={st} onClose={() => setStep(0)} />}
    </div>
  );
}

/** Aviso para el administrador mientras la baja está pedida. */
export function BajaBanner() {
  const { st, setSt } = useBaja();
  const [busy, setBusy] = useState(false);
  if (!st || !st.active) return null;
  async function withdraw() {
    setBusy(true);
    try { setSt(await appApi<BajaState>(`${EP}/withdraw`, { method: "POST", body: {} })); window.dispatchEvent(new Event(CHANGED)); } catch { /* queda como estaba */ } finally { setBusy(false); }
  }
  return (
    <div className="tn-note tn-note-warn" role="status" data-testid="baja-banner" style={{ margin: "0 0 12px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <span><strong>Baja pedida ({st.code}).</strong> Seguís usando {APP_NAME} hasta el {day(st.service_end_date)}.</span>
      <button className="secondary-button" onClick={withdraw} disabled={busy}>{busy ? "Un momento..." : "Retirar la baja"}</button>
    </div>
  );
}
