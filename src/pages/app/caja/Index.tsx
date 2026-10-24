// Ventas y caja (G3): cobro del turno y venta suelta, caja del día con arqueo y cierre, historial de ventas.
import { useCallback, useEffect, useState } from "react";
import { appApi, getSessionUser, money, splitList, vocab } from "../../../config";
import { Empty, Loading, PageHeader, Pill, Tabs, useFlash } from "../../../components/ui";
import { ErrorNote, Kpi, dmy, dmyhm, hm, mlabel, todayKey, useLoad } from "../../../components/g3/common";
import Cobro from "../../../components/g3/Cobro";
import { CloseShiftModal, DayPanel, MovementModal, OpenShiftModal, SaleDetail } from "../../../components/g3/CajaPanels";
import type { ProLite, SaleT, ShiftState } from "../../../components/g3/types";
import { proName } from "../../../components/g3/types";

interface ToCollect {
  appointment_id: number; start_at: string; status: string; customer_name: string; services: string[]; professionals: string[];
  total: number; deposit_paid: number; sale_id: number | null; sale_number: number | null;
}
interface SaleRow {
  id: number; number: number; status: string; customer_name: string | null; total: number; tip_total: number; discount_total: number; methods: string[];
  summary: string; professionals: string[]; fiscal_ref: string | null; date: string; appointment_id: number | null;
}
type Tab = "cobrar" | "dia" | "ventas";

export default function CajaPage() {
  const user = getSessionUser();
  const v = vocab(user);
  const modules = splitList(user?.enabled_modules);
  const flash = useFlash();
  const [tab, setTab] = useState<Tab>("cobrar");
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((n) => n + 1), []);
  const shift = useLoad<ShiftState>(`/cash-shifts/current?v=${version}`);
  const [cobro, setCobro] = useState<number | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  const [modal, setModal] = useState<"open" | "close" | "move" | null>(null);
  const state = shift.data;
  const open = !!state?.shift;

  async function startSale(path: string, body?: unknown) {
    try { const s = await appApi<SaleT>(path, { method: "POST", body }); setCobro(s.id); bump(); } catch (e) { flash.fail(e); }
  }

  return (
    <div data-tour="caja">
      <PageHeader eyebrow="CAJA" title="Ventas y caja" subtitle={`Cobrá el ${v.turno} o una venta suelta, y cerrá el día con el arqueo.`}>
        {state && (open
          ? <><Pill tone="green">Caja abierta desde las {hm(state.shift!.opened_at)}</Pill><button className="secondary-button" onClick={() => setModal("close")}>Cerrar caja</button></>
          : <button className="primary-button" onClick={() => setModal("open")}>Abrir caja</button>)}
        <button className="primary-button" onClick={() => startSale("/sales", {})} disabled={!open} title={open ? "" : "Abrí la caja para cobrar"} data-tour="caja-nueva">Nueva venta</button>
      </PageHeader>
      <ErrorNote text={shift.error} />
      {state?.stale && <div className="tn-note tn-note-warn" role="alert" style={{ marginBottom: 14 }}>
        Hay una caja abierta desde el {dmy(state.shift!.opened_at)}. Cerrala con el arqueo para que las ventas queden en el día correcto.</div>}
      {!open && state && <div className="tn-note tn-note-info" style={{ marginBottom: 14 }}>La caja está cerrada. Abrila con el efectivo del cajón para empezar a cobrar.</div>}
      <Tabs value={tab} onChange={setTab} options={[["cobrar", "Cobrar"], ["dia", "Caja del día"], ["ventas", "Ventas"]]} />
      {!state && !shift.error && <Loading />}
      {state && tab === "cobrar" && <Cobrar open={open} version={version} onPick={(id) => setCobro(id)} onFromAppointment={(id) => startSale(`/sales/from-appointment/${id}`)} />}
      {state && tab === "dia" && <DayPanel state={state} version={version} onMove={() => setModal("move")} onClose={() => setModal("close")} />}
      {state && tab === "ventas" && <Ventas version={version} onOpen={(r) => (r.status === "ABIERTA" ? setCobro(r.id) : setDetail(r.id))} />}
      {cobro !== null && <Cobro saleId={cobro} shift={state} modules={modules} onChanged={bump} onClose={() => { setCobro(null); bump(); }} />}
      {detail !== null && <SaleDetail saleId={detail} onChanged={bump} onClose={() => setDetail(null)} />}
      {modal === "open" && <OpenShiftModal onClose={() => setModal(null)} onDone={() => { setModal(null); bump(); flash.show("Caja abierta"); }} />}
      {modal === "close" && state?.shift && <CloseShiftModal shift={state.shift} blind={state.blind_cash_close} onClose={() => setModal(null)} onDone={() => { setModal(null); bump(); }} />}
      {modal === "move" && <MovementModal onClose={() => setModal(null)} onDone={() => { setModal(null); bump(); flash.show("Movimiento registrado"); }} />}
      {flash.node}
    </div>
  );
}

function Cobrar({ open, version, onPick, onFromAppointment }: { open: boolean; version: number; onPick: (id: number) => void; onFromAppointment: (id: number) => void }) {
  const v = vocab(getSessionUser());
  const day = todayKey();
  const list = useLoad<ToCollect[]>(`/sales/to-collect?date=${day}&v=${version}`);
  const opens = useLoad<SaleRow[]>(`/sales?status=ABIERTA&limit=30&v=${version}`);
  const today = useLoad<SaleRow[]>(`/sales?date=${day}&status=COBRADA&limit=8&v=${version}`);
  return (
    <div className="tn-stack">
      <div className="tn-card">
        <div className="tn-card-head"><div><h2>Para cobrar hoy</h2><p>{cap1(v.turnos)} del día que todavía no se cobraron.</p></div></div>
        <ErrorNote text={list.error} />
        {list.data && list.data.length === 0 && <Empty title="No hay nada pendiente de cobro">Cuando un {v.turno} esté confirmado o en curso, aparece acá para cobrarlo con un toque.</Empty>}
        <ul className="tn-list">
          {(list.data || []).map((a) => (
            <li key={a.appointment_id}>
              <div className="tn-list-main">
                <strong>{hm(a.start_at)} · {a.customer_name}</strong>
                <small>{a.services.join(", ")}{a.professionals.length ? ` · con ${a.professionals.join(", ")}` : ""}</small>
                {a.deposit_paid > 0 && <small>Seña ya paga: {money(a.deposit_paid)}</small>}
              </div>
              <span className="tn-list-amount">{money(a.total)}</span>
              <button className="primary-button g3-small" disabled={!open} title={open ? "" : "Abrí la caja para cobrar"} onClick={() => (a.sale_id ? onPick(a.sale_id) : onFromAppointment(a.appointment_id))}>
                {a.sale_id ? "Seguir cobrando" : "Cobrar"}</button>
            </li>))}
        </ul>
      </div>
      {(opens.data || []).length > 0 && (
        <div className="tn-card">
          <div className="tn-card-head"><div><h2>Ventas abiertas</h2><p>Tickets armados que todavía no se cobraron.</p></div></div>
          <ul className="tn-list">
            {opens.data!.map((s) => (
              <li key={s.id} className="is-click" onClick={() => onPick(s.id)}>
                <div className="tn-list-main"><strong>#{s.number} · {s.customer_name || "Sin cliente"}</strong><small>{s.summary || "Sin ítems"}</small></div>
                <span className="tn-list-amount">{money(s.total)}</span>
              </li>))}
          </ul>
        </div>)}
      <div className="tn-card">
        <div className="tn-card-head"><div><h2>Últimos cobros de hoy</h2></div></div>
        {today.data && today.data.length === 0 && <Empty title="Todavía no hay cobros hoy" />}
        <ul className="tn-list">
          {(today.data || []).map((s) => (
            <li key={s.id}>
              <div className="tn-list-main"><strong>#{s.number} · {s.customer_name || "Sin cliente"}</strong><small>{hm(s.date)} · {s.methods.map(mlabel).join(", ")}</small></div>
              <span className="tn-list-amount">{money(s.total)}</span>
            </li>))}
        </ul>
      </div>
    </div>
  );
}
const cap1 = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function Ventas({ version, onOpen }: { version: number; onOpen: (r: SaleRow) => void }) {
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [pro, setPro] = useState("");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = window.setTimeout(() => setDq(q), 300); return () => window.clearTimeout(t); }, [q]);
  const user = getSessionUser();
  const pros = useLoad<ProLite[]>(user?.role === "PROFESIONAL" ? null : "/professionals");
  const qs = `date=${from}&date_to=${to}${status ? `&status=${status}` : ""}${method ? `&method=${method}` : ""}${pro ? `&professional_id=${pro}` : ""}${dq.trim() ? `&q=${encodeURIComponent(dq.trim())}` : ""}&limit=300&v=${version}`;
  const rows = useLoad<SaleRow[]>(`/sales?${qs}`);
  const cobradas = (rows.data || []).filter((r) => r.status === "COBRADA");
  const total = cobradas.reduce((s, r) => s + r.total, 0);
  const tips = cobradas.reduce((s, r) => s + r.tip_total, 0);
  return (
    <div className="tn-stack">
      <div className="tn-filters" data-tour="caja-ventas">
        <label>Desde <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <label>Hasta <input type="date" value={to} min={from} max={todayKey()} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        <select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todas</option><option value="COBRADA">Cobradas</option><option value="ANULADA">Anuladas</option><option value="ABIERTA">Abiertas</option></select>
        <select aria-label="Medio de pago" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">Todos los medios</option>{["EFECTIVO", "DEBITO", "CREDITO", "TRANSFERENCIA", "MERCADOPAGO", "QR", "SALDO_A_FAVOR", "OTRO"].map((m) => <option key={m} value={m}>{mlabel(m)}</option>)}</select>
        {pros.data && <select aria-label="Profesional" value={pro} onChange={(e) => setPro(e.target.value)}><option value="">Todo el equipo</option>{pros.data.map((p) => <option key={p.id} value={p.id}>{proName(p)}</option>)}</select>}
        <input className="tn-search" placeholder="Cliente o N.º de venta" aria-label="Buscar venta" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="tn-kpis">
        <Kpi label="Cobrado en el período" value={money(total)} hint={`${cobradas.length} ventas`} />
        <Kpi label="Propinas" value={money(tips)} />
      </div>
      <ErrorNote text={rows.error} />
      {rows.loading && !rows.data && <Loading />}
      {rows.data && rows.data.length === 0 && <Empty title="No hay ventas con esos filtros">Probá con otro rango de fechas.</Empty>}
      {rows.data && rows.data.length > 0 && (
        <div className="tn-table-wrap">
          <table className="tn-table">
            <thead><tr><th>N.º</th><th>Fecha</th><th>Cliente</th><th>Detalle</th><th>Medios</th><th className="num">Total</th><th>Estado</th></tr></thead>
            <tbody>
              {rows.data.map((r) => (
                <tr key={r.id} className="is-click" tabIndex={0} onClick={() => onOpen(r)} onKeyDown={(e) => e.key === "Enter" && onOpen(r)}>
                  <td>#{r.number}</td><td>{dmyhm(r.date)}</td><td>{r.customer_name || "—"}</td>
                  <td>{r.summary}{r.professionals.length > 0 && <small>{r.professionals.join(", ")}</small>}</td>
                  <td>{r.methods.map(mlabel).join(", ") || "—"}</td>
                  <td className="num">{money(r.total)}{r.tip_total > 0 && <small>+{money(r.tip_total)} prop.</small>}</td>
                  <td><Pill tone={r.status === "COBRADA" ? "green" : r.status === "ANULADA" ? "red" : "orange"}>{r.status === "COBRADA" ? "Cobrada" : r.status === "ANULADA" ? "Anulada" : "Abierta"}</Pill></td>
                </tr>))}
            </tbody>
          </table>
        </div>)}
    </div>
  );
}
