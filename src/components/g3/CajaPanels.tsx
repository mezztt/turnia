// Piezas de la pantalla de Caja: abrir y cerrar turno, movimientos, caja del día y detalle de una venta.
import { useState } from "react";
import { appApi, getSessionUser, money } from "../../config";
import { Empty, Field, Modal, Pill, Seg, useFlash } from "../ui";
import { printSaleTicket } from "../../pages/print/g3print";
import type { TicketData } from "../../pages/print/g3print";
import { ErrorNote, Kpi, NumInput, PinField, dmyhm, errMsg, hm, mlabel, shiftDay, todayKey, useLoad } from "./common";
import type { SaleT, ShiftState, ShiftT } from "./types";

export function OpenShiftModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [float, setFloat] = useState<number | null>(0);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try { await appApi("/cash-shifts/open", { method: "POST", body: { opening_float: float || 0, notes: notes.trim() || null } }); onDone(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="CAJA" title="Abrir la caja" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="primary-button" onClick={go} disabled={busy}>Abrir caja</button></>}>
      <ErrorNote text={err} />
      <div className="tn-grid-form">
        <Field label="Efectivo con el que arrancás" hint="El fondo de cambio que hay en el cajón."><NumInput value={float} onChange={setFloat} ariaLabel="Fondo de caja" autoFocus /></Field>
        <Field label="Nota (opcional)"><input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export function CloseShiftModal({ shift, blind, onClose, onDone }: { shift: ShiftT; blind: boolean; onClose: () => void; onDone: () => void }) {
  const [counted, setCounted] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ShiftT | null>(null);
  async function go() {
    setBusy(true);
    try { setResult(await appApi<ShiftT>(`/cash-shifts/${shift.id}/close`, { method: "POST", body: { counted_cash: counted || 0, notes: notes.trim() || null } })); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  if (result) {
    const d = result.difference || 0;
    return (
      <Modal eyebrow="CAJA CERRADA" title="Cierre de caja" onClose={onDone} footer={<button className="primary-button" onClick={onDone}>Listo</button>}>
        <div className="g3-split-list">
          <div><span>Efectivo esperado</span><b>{money(result.expected_cash)}</b></div>
          <div><span>Efectivo contado</span><b>{money(result.counted_cash)}</b></div>
          <div className="g3-total"><span>Diferencia</span><b>{d === 0 ? "Sin diferencia" : (d > 0 ? "Sobran " : "Faltan ") + money(Math.abs(d))}</b></div>
        </div>
        {d !== 0 && <div className="tn-note tn-note-warn" style={{ marginTop: 12 }}>La diferencia queda registrada en el historial de cajas.</div>}
      </Modal>
    );
  }
  return (
    <Modal eyebrow="CAJA" title="Cerrar la caja" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="primary-button" onClick={go} disabled={busy || counted === null}>Cerrar caja</button></>}>
      <ErrorNote text={err} />
      <p className="tn-muted">{blind ? "Contá el efectivo del cajón y cargalo. Recién al cerrar ves cuánto tenía que haber." : `En el cajón tendría que haber ${money(shift.expected_cash)}.`}</p>
      <div className="tn-grid-form">
        <Field label="Efectivo contado"><NumInput value={counted} onChange={setCounted} ariaLabel="Efectivo contado" autoFocus /></Field>
        <Field label="Nota (opcional)"><input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export function MovementModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const user = getSessionUser();
  const [kind, setKind] = useState<"INGRESO" | "EGRESO" | "RETIRO">("EGRESO");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const needsPin = kind === "RETIRO" && user?.role === "RECEPCION";
  async function go() {
    setBusy(true);
    try { await appApi("/cash-movements", { method: "POST", body: { kind, concept: concept.trim(), amount, pin: pin || null } }); onDone(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="EFECTIVO" title="Movimiento de caja" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button>
        <button className="primary-button" onClick={go} disabled={busy || !amount || concept.trim().length < 2 || (needsPin && pin.length < 4)}>Registrar</button></>}>
      <ErrorNote text={err} />
      <div className="tn-grid-form">
        <Field label="Tipo" wide><Seg value={kind} options={[["INGRESO", "Ingreso"], ["EGRESO", "Egreso (gasto)"], ["RETIRO", "Retiro"]]} onChange={setKind} /></Field>
        <Field label="Concepto"><input value={concept} maxLength={150} onChange={(e) => setConcept(e.target.value)} placeholder={kind === "EGRESO" ? "Ej.: compra de café" : kind === "RETIRO" ? "Ej.: retiro del dueño" : "Ej.: cambio"} /></Field>
        <Field label="Importe"><NumInput value={amount} onChange={setAmount} ariaLabel="Importe" /></Field>
        {needsPin && <PinField value={pin} onChange={setPin} what="registrar un retiro" />}
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------------------------------------------------------
interface DayT {
  date: string; by_method: Record<string, number>; tips_by_method: Record<string, number>; sales_count: number; sales_total: number; tips_total: number;
  discounts_total: number; voided_count: number; movements: { id: number; kind: string; concept: string; amount: number; created_at: string }[];
  shifts: { id: number; status: string; opened_at: string; closed_at: string | null; difference: number | null }[];
}

export function DayPanel({ state, onMove, onClose, version }: { state: ShiftState | null; onMove: () => void; onClose: () => void; version: number }) {
  const [day, setDay] = useState(todayKey());
  const d = useLoad<DayT>(`/cash-shifts/day?date=${day}&v=${version}`);
  const hist = useLoad<{ id: number; status: string; opened_at: string; closed_at: string | null; opened_by: string | null; sales_total: number; sales_count: number; expected_cash: number | null; counted_cash: number | null; difference: number | null }[]>(
    state?.can_manage ? `/cash-shifts?limit=15&v=${version}` : null);
  const cur = state?.shift;
  const isToday = day === todayKey();
  return (
    <div className="tn-stack">
      <div className="tn-row">
        <button className="secondary-button" onClick={() => setDay(shiftDay(day, -1))} aria-label="Día anterior">‹</button>
        <input type="date" aria-label="Día" value={day} max={todayKey()} onChange={(e) => e.target.value && setDay(e.target.value)} className="g3-date" />
        <button className="secondary-button" onClick={() => setDay(shiftDay(day, 1))} disabled={isToday} aria-label="Día siguiente">›</button>
        {!isToday && <button className="tn-link-button" onClick={() => setDay(todayKey())}>Hoy</button>}
      </div>
      {cur && isToday && (
        <div className="tn-card" data-tour="caja-turno">
          <div className="tn-card-head">
            <div><h2>Caja abierta</h2><p>Desde las {hm(cur.opened_at)} · {cur.opened_by} · fondo {money(cur.opening_float)}</p></div>
            <div className="tn-row"><button className="secondary-button" onClick={onMove}>Ingreso, gasto o retiro</button><button className="primary-button" onClick={onClose}>Cerrar caja</button></div>
          </div>
          <div className="tn-kpis">
            <Kpi label="Ventas del turno" value={money(cur.sales_total)} hint={`${cur.sales_count} cobradas`} />
            <Kpi label="Efectivo cobrado" value={money(cur.cash_in)} hint="con propinas en efectivo" />
            <Kpi label="Efectivo esperado" value={cur.expected_cash === null ? "Se ve al cerrar" : money(cur.expected_cash)} hint={cur.expected_cash === null ? "Arqueo ciego: contá primero" : "fondo + cobros + ingresos − egresos"} />
          </div>
        </div>)}
      {d.error && <ErrorNote text={d.error} />}
      {d.data && (
        <>
          <div className="tn-kpis">
            <Kpi label="Cobrado del día" value={money(d.data.sales_total)} hint={`${d.data.sales_count} ventas`} />
            <Kpi label="Propinas" value={money(d.data.tips_total)} hint="aparte de las ventas" />
            <Kpi label="Descuentos" value={money(d.data.discounts_total)} />
            <Kpi label="Anuladas" value={d.data.voided_count} tone={d.data.voided_count ? "warn" : undefined} />
          </div>
          <div className="tn-grid-2">
            <div className="tn-card">
              <h2>Por medio de pago</h2>
              {Object.keys(d.data.by_method).length === 0 ? <Empty title="Todavía no se cobró nada">Cuando cobres, vas a ver acá el desglose.</Empty> : (
                <div className="g3-split-list">
                  {Object.entries(d.data.by_method).map(([m, a]) => <div key={m}><span>{mlabel(m)}</span><b>{money(a)}</b></div>)}
                </div>)}
              {Object.keys(d.data.tips_by_method).length > 0 && (
                <><h2 style={{ marginTop: 16 }}>Propinas por medio</h2>
                  <div className="g3-split-list">{Object.entries(d.data.tips_by_method).map(([m, a]) => <div key={m}><span>{mlabel(m)}</span><b>{money(a)}</b></div>)}</div></>)}
            </div>
            <div className="tn-card">
              <h2>Movimientos de efectivo</h2>
              {d.data.movements.length === 0 ? <Empty title="Sin movimientos">Ingresos, gastos y retiros del día.</Empty> : (
                <div className="g3-split-list">
                  {d.data.movements.map((m) => <div key={m.id}><span>{hm(m.created_at)} · {m.concept} <Pill tone={m.kind === "INGRESO" ? "green" : m.kind === "RETIRO" ? "violet" : "orange"}>{m.kind === "INGRESO" ? "Ingreso" : m.kind === "RETIRO" ? "Retiro" : "Gasto"}</Pill></span>
                    <b>{m.kind === "INGRESO" ? "+" : "-"}{money(m.amount)}</b></div>)}
                </div>)}
            </div>
          </div>
        </>)}
      {hist.data && hist.data.length > 0 && (
        <div className="tn-card">
          <h2>Cajas anteriores</h2>
          <div className="tn-table-wrap">
            <table className="tn-table">
              <thead><tr><th>Apertura</th><th>Cierre</th><th>Responsable</th><th className="num">Ventas</th><th className="num">Esperado</th><th className="num">Contado</th><th className="num">Diferencia</th></tr></thead>
              <tbody>
                {hist.data.map((h) => (
                  <tr key={h.id}>
                    <td>{dmyhm(h.opened_at)}</td><td>{h.closed_at ? dmyhm(h.closed_at) : <Pill tone="orange">Abierta</Pill>}</td><td>{h.opened_by}</td>
                    <td className="num">{money(h.sales_total)} <small>{h.sales_count} ventas</small></td>
                    <td className="num">{h.expected_cash === null ? "—" : money(h.expected_cash)}</td><td className="num">{h.counted_cash === null ? "—" : money(h.counted_cash)}</td>
                    <td className="num">{h.difference === null ? "—" : h.difference === 0 ? "Sin diferencia" : <Pill tone={h.difference < 0 ? "red" : "orange"}>{h.difference > 0 ? "+" : ""}{money(h.difference)}</Pill>}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </div>)}
    </div>
  );
}

// ----------------------------------------------------------------------------------------------------------------
export function SaleDetail({ saleId, onClose, onChanged }: { saleId: number; onClose: () => void; onChanged: () => void }) {
  const user = getSessionUser();
  const flash = useFlash();
  const { data: s, error, reload } = useLoad<SaleT>(`/sales/${saleId}`);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [fiscal, setFiscal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsPin = user?.role === "RECEPCION";
  const canVoid = user?.role !== "PROFESIONAL";
  if (!s) return <Modal title="Venta" onClose={onClose}><ErrorNote text={error} />{!error && <p className="tn-muted">Cargando...</p>}</Modal>;
  async function void_() {
    setBusy(true);
    try { await appApi(`/sales/${saleId}/void`, { method: "POST", body: { reason: reason.trim(), pin: pin || null } }); flash.show("Venta anulada"); setVoiding(false); await reload(); onChanged(); } catch (e) { flash.fail(e); } finally { setBusy(false); }
  }
  async function saveFiscal() {
    setBusy(true);
    try { await appApi(`/sales/${saleId}`, { method: "PUT", body: { fiscal_ref: fiscal || "" } }); flash.show("Guardado"); setFiscal(null); await reload(); onChanged(); } catch (e) { flash.fail(e); } finally { setBusy(false); }
  }
  async function print() {
    try { printSaleTicket(await appApi<TicketData>(`/sales/${saleId}/print`)); } catch (e) { flash.fail(e); }
  }
  return (
    <Modal eyebrow={`VENTA #${s.number}`} title={s.customer?.name || "Venta sin cliente"} onClose={onClose}
      footer={<><button className="secondary-button" onClick={print}>Imprimir ticket</button>
        {s.status === "COBRADA" && canVoid && !voiding && <button className="tn-danger-button" onClick={() => setVoiding(true)}>Anular venta</button>}
        <button className="primary-button" onClick={onClose}>Cerrar</button></>}>
      <div className="tn-row" style={{ marginBottom: 10 }}>
        <Pill tone={s.status === "COBRADA" ? "green" : s.status === "ANULADA" ? "red" : "orange"}>{s.status === "COBRADA" ? "Cobrada" : s.status === "ANULADA" ? "Anulada" : "Abierta"}</Pill>
        <span className="tn-muted">{dmyhm(s.paid_at || s.created_at)}</span>
      </div>
      {s.status === "ANULADA" && <div className="tn-note tn-note-error">Anulada: {s.void_reason}</div>}
      <div className="tn-table-wrap">
        <table className="tn-table">
          <thead><tr><th>Ítem</th><th className="num">Cant.</th><th className="num">Total</th></tr></thead>
          <tbody>{s.items.map((i) => <tr key={i.id}><td>{i.name}{i.professional_name && <small>con {i.professional_name}</small>}{i.paid_with_pack && <Pill tone="violet">Pack o membresía</Pill>}</td><td className="num">{i.qty}</td><td className="num">{money(i.total)}</td></tr>)}</tbody>
          <tfoot>
            {s.discount_total > 0 && <tr><td colSpan={2}>Descuentos</td><td className="num">-{money(s.discount_total)}</td></tr>}
            <tr><td colSpan={2}>Total</td><td className="num">{money(s.total)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div className="g3-split-list" style={{ marginTop: 12 }}>
        {s.payments.map((p) => <div key={p.id}><span>{mlabel(p.method)}{p.purpose === "SENIA" ? " (seña)" : ""}{p.status === "DEVUELTO" ? " · devuelto" : ""}</span><b>{money(p.amount)}{p.tip_amount > 0 ? ` + ${money(p.tip_amount)} propina` : ""}</b></div>)}
      </div>
      {s.status !== "ABIERTA" && (
        <div style={{ marginTop: 14 }}>
          {fiscal === null ? (
            <p className="tn-hint">{s.fiscal_ref ? <>Comprobante emitido aparte: <strong>{s.fiscal_ref}</strong> · </> : "Sin comprobante fiscal asociado. "}<button className="tn-link-button" onClick={() => setFiscal(s.fiscal_ref || "")}>{s.fiscal_ref ? "Cambiar" : "Anotar el número"}</button></p>
          ) : (
            <div className="tn-row"><input aria-label="Número de comprobante" value={fiscal} maxLength={40} onChange={(e) => setFiscal(e.target.value)} placeholder="Ej.: 0001-00001234" />
              <button className="primary-button g3-small" onClick={saveFiscal} disabled={busy}>Guardar</button><button className="tn-link-button" onClick={() => setFiscal(null)}>Cancelar</button></div>)}
        </div>)}
      {voiding && (
        <div className="tn-card g3-void" style={{ marginTop: 14 }}>
          <h2>Anular venta #{s.number}</h2>
          <p className="tn-muted">Se devuelven los pagos, se repone el stock y se deshacen packs, comisiones y puntos de esta venta.</p>
          <Field label="Motivo"><input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
          {needsPin && <PinField value={pin} onChange={setPin} what="anular ventas" />}
          <div className="tn-row"><button className="tn-danger-button" disabled={busy || reason.trim().length < 3 || (needsPin && pin.length < 4)} onClick={void_}>Anular</button>
            <button className="secondary-button" onClick={() => setVoiding(false)}>Volver</button></div>
        </div>)}
      {flash.node}
    </Modal>
  );
}

