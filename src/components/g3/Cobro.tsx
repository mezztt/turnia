// Pantalla de cobro: el ticket con servicios, productos, packs y descuentos, y el cobro con varios medios de pago y propina.
import { useEffect, useMemo, useState } from "react";
import { appApi, getSessionUser, money, vocab } from "../../config";
import { Field, Modal, Pill, Seg, useFlash } from "../ui";
import { ConfirmModal } from "../r1/common";
import { printSaleTicket } from "../../pages/print/g3print";
import type { TicketData } from "../../pages/print/g3print";
import { CustomerPicker, ErrorNote, NumInput, PAY_METHODS, PinField, WaButton, errMsg, mlabel, useLoad } from "./common";
import type { CustLite } from "./common";
import { proName } from "./types";
import type { ProLite, SaleItemT, SaleT, ShiftState } from "./types";

interface SvcLite { id: number; name: string; price: number; price_is_from?: boolean }
interface ProdLite { id: number; name: string; brand: string | null; price: number; stock_qty: number; unit: string; track_stock: boolean }
interface PackTplLite { id: number; name: string; price: number; sessions_total: number }
interface PlanLite { id: number; name: string; price: number; period_days: number }
interface Line { key: number; method: string; amount: number | null; auto: boolean }

const roundPeso = (n: number) => Math.round(n);

export default function Cobro({ saleId, shift, modules, onClose, onChanged }: {
  saleId: number; shift: ShiftState | null; modules: string[]; onClose: () => void; onChanged: () => void;
}) {
  const user = getSessionUser();
  const v = vocab(user);
  const flash = useFlash();
  const isManager = user?.role === "ADMINISTRADOR" || user?.role === "ENCARGADO";
  const needsPin = user?.role === "RECEPCION";
  const canDiscount = user?.role !== "PROFESIONAL";
  const [sale, setSale] = useState<SaleT | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [discounting, setDiscounting] = useState(false);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [done, setDone] = useState(false);
  const [applyDeposit, setApplyDeposit] = useState(true);
  const [lines, setLines] = useState<Line[]>([{ key: 1, method: "EFECTIVO", amount: null, auto: true }]);
  const [tip, setTip] = useState<number | null>(null);
  const [tipMethod, setTipMethod] = useState("EFECTIVO");
  const [fiscal, setFiscal] = useState("");
  const pros = useLoad<ProLite[]>("/professionals");

  const load = () => appApi<SaleT>(`/sales/${saleId}`).then((s) => { setSale(s); setError(""); }).catch((e) => setError(errMsg(e)));
  useEffect(() => { void load(); }, [saleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = sale?.status === "ABIERTA";
  const dueDeposit = applyDeposit && sale ? sale.deposit_available : 0;
  const due = sale ? Math.max(0, sale.total - dueDeposit) : 0;
  const paid = lines.reduce((s, l) => s + (l.amount || 0), 0);
  const cashPaid = lines.filter((l) => l.method === "EFECTIVO").reduce((s, l) => s + (l.amount || 0), 0);
  const diff = Math.round((paid - due) * 100) / 100;
  const credit = sale?.customer?.credit_balance || 0;
  const creditUsed = lines.filter((l) => l.method === "SALDO_A_FAVOR").reduce((s, l) => s + (l.amount || 0), 0);

  // el primer renglón sigue al total mientras nadie lo toque
  useEffect(() => {
    setLines((ls) => (ls.length === 1 && ls[0].auto ? [{ ...ls[0], amount: due > 0 ? due : null }] : ls));
  }, [due]);

  async function act<T>(fn: () => Promise<T>, okText?: string): Promise<T | null> {
    setBusy(true);
    try { const r = await fn(); if (okText) flash.show(okText); return r; } catch (e) { flash.fail(e); return null; } finally { setBusy(false); }
  }
  const put = async (path: string, method: string, body?: unknown, okText?: string) => {
    const r = await act(() => appApi<SaleT>(path, { method, body }), okText);
    if (r) { setSale(r); onChanged(); }
    return r;
  };

  async function pay() {
    if (!sale) return;
    const payments = lines.filter((l) => (l.amount || 0) > 0).map((l) => ({ method: l.method, amount: l.amount || 0, tip_amount: 0 }));
    if (tip && tip > 0) {
      const target = payments.find((p) => p.method === tipMethod);
      if (target) target.tip_amount = tip; else payments.push({ method: tipMethod, amount: 0, tip_amount: tip });
    }
    const r = await act(() => appApi<SaleT>(`/sales/${sale.id}/pay`, { method: "POST", body: { payments, apply_deposit: applyDeposit, fiscal_ref: fiscal.trim() || null } }));
    if (r) { setSale(r); setDone(true); onChanged(); }
  }

  async function discard() {
    if (!sale) return;
    setDiscardAsk(false);
    const r = await act(() => appApi<SaleT>(`/sales/${sale.id}/void`, { method: "POST", body: { reason: "Descartada" } }), "Venta descartada");
    if (r) { onChanged(); onClose(); }
  }

  async function printTicket() {
    if (!sale) return;
    try { printSaleTicket(await appApi<TicketData>(`/sales/${sale.id}/print`)); } catch (e) { flash.fail(e); }
  }

  const tipOptions = shift?.tip_enabled ? shift.tip_options : [];
  const canPay = open && !!shift?.shift && !busy && (sale?.items.length || 0) > 0 && diff >= 0 && (diff === 0 || (diff <= cashPaid)) && creditUsed <= credit + 0.001;

  if (error && !sale) return <Modal title="Venta" onClose={onClose}><ErrorNote text={error} /></Modal>;
  if (!sale) return <Modal title="Venta" onClose={onClose}><p className="tn-muted">Cargando...</p></Modal>;

  // ------------------------------------------------------------------ cobrada
  if (done || sale.status !== "ABIERTA") {
    const wa = sale.customer?.phone_wa;
    return (
      <Modal eyebrow={`VENTA #${sale.number}`} title={sale.status === "ANULADA" ? "Venta anulada" : "Cobrado"} onClose={onClose}
        footer={<><button className="secondary-button" onClick={printTicket}>Imprimir ticket</button><button className="primary-button" onClick={onClose}>Listo</button></>}>
        <div className="g3-done" data-tour="caja-cobrado">
          <strong className="g3-big">{money(sale.total)}</strong>
          {sale.tip_total > 0 && <span className="tn-muted">+ {money(sale.tip_total)} de propina</span>}
          {(sale.change || 0) > 0 && <div className="tn-note tn-note-info">Vuelto para el cliente: <strong>{money(sale.change)}</strong></div>}
          {(sale.warnings || []).map((w) => <div key={w} className="tn-note tn-note-warn">{w}</div>)}
          <div className="g3-split-list">
            {sale.payments.map((p) => <div key={p.id}><span>{mlabel(p.method)}{p.status === "DEVUELTO" ? " (devuelto)" : ""}</span><b>{money(p.amount)}</b></div>)}
          </div>
          <p className="tn-hint">Documento no válido como factura. Si emitís el comprobante aparte, anotá el número en Ventas.</p>
          {wa && <WaButton phoneWa={wa} label="Mandar agradecimiento" text={`Hola ${sale.customer?.name.split(" ")[0]}, gracias por venir. ¡Te esperamos pronto!`} />}
        </div>
        {flash.node}
      </Modal>
    );
  }

  // ------------------------------------------------------------------ abierta
  return (
    <Modal eyebrow={`VENTA #${sale.number}`} title={sale.appointment_id ? `Cobrar el ${v.turno}` : "Venta"} size="xl" onClose={onClose}
      footer={<>
        <button className="g3-linkd g3-left" onClick={() => setDiscardAsk(true)} disabled={busy}>Descartar venta</button>
        <button className="secondary-button" onClick={onClose}>Cerrar</button>
        <button className="primary-button" onClick={pay} disabled={!canPay} data-tour="caja-cobrar">Cobrar {money(due + (tip || 0))}</button>
      </>}>
      <div className="g3-cobro">
        <div className="g3-cobro-main">
          {!shift?.shift && <div className="tn-note tn-note-warn" role="alert">La caja está cerrada. Abrila desde la pantalla de Caja para poder cobrar.</div>}
          <div className="g3-cust">
            {sale.appointment_id ? (
              <div className="g3-picked"><span><strong>{sale.customer?.name || "—"}</strong>{sale.customer?.phone && <small>{sale.customer.phone}</small>}</span><Pill tone="brand">Del {v.turno}</Pill></div>
            ) : (
              <CustomerPicker label="Cliente (opcional)" value={sale.customer ? { id: sale.customer.id, name: sale.customer.name, phone: sale.customer.phone } : null}
                hint="Hace falta para packs, membresías, saldo a favor y puntos."
                onChange={(c: CustLite | null) => put(`/sales/${sale.id}`, "PUT", c ? { customer_id: c.id } : { clear_customer: true })} />
            )}
            {credit > 0 && <Pill tone="green">Saldo a favor {money(credit)}</Pill>}
          </div>

          <div className="tn-table-wrap">
            <table className="tn-table g3-items">
              <thead><tr><th>Ítem</th><th className="num">Cant.</th><th className="num">Precio</th><th className="num">Total</th><th /></tr></thead>
              <tbody>
                {sale.items.map((it) => (
                  <ItemRow key={it.id} it={it} sale={sale} pros={pros.data || []} isManager={isManager} busy={busy}
                    onPatch={(body, okText) => put(`/sales/${sale.id}/items/${it.id}`, "PUT", body, okText)}
                    onRemove={() => put(`/sales/${sale.id}/items/${it.id}`, "DELETE")} />
                ))}
                {sale.items.length === 0 && <tr><td colSpan={5}><span className="tn-muted">Todavía no hay nada cargado. Agregá un servicio, un producto, un pack o una membresía.</span></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="tn-row">
            <button className="secondary-button" onClick={() => setAdding(true)} data-tour="caja-agregar">+ Agregar ítem</button>
            {canDiscount && sale.items.length > 0 && <button className="secondary-button" onClick={() => setDiscounting(true)}>Aplicar descuento</button>}
          </div>
          {sale.discounts.length > 0 && (
            <ul className="g3-discounts">
              {sale.discounts.map((d) => (
                <li key={d.id}><span>{d.reason || "Descuento"} <small className="tn-muted">({d.kind === "PCT" ? `${d.value}%` : money(d.value)}{d.sale_item_id ? ", un ítem" : ", toda la venta"})</small></span>
                  <b>-{money(d.amount)}</b>
                  {canDiscount && !(d.reason || "").startsWith("Membresía") && <button className="tn-link-button" onClick={() => put(`/sales/${sale.id}/discounts/${d.id}`, "DELETE")} disabled={busy} aria-label="Sacar descuento">Sacar</button>}
                </li>))}
            </ul>)}
        </div>

        <aside className="g3-cobro-side" aria-label="Cobro">
          <div className="g3-totals">
            <div><span>Subtotal</span><b>{money(sale.subtotal)}</b></div>
            {sale.discount_total > 0 && <div><span>Descuentos</span><b>-{money(sale.discount_total)}</b></div>}
            <div className="g3-total"><span>Total</span><b>{money(sale.total)}</b></div>
            {sale.deposit_available > 0 && (
              <label className="g3-check">
                <input type="checkbox" checked={applyDeposit} onChange={(e) => setApplyDeposit(e.target.checked)} />
                <span>Descontar la seña ya pagada ({money(sale.deposit_available)})</span>
              </label>)}
            <div className="g3-total g3-due"><span>A cobrar</span><b>{money(due)}</b></div>
          </div>

          <div className="g3-pay">
            <h3>Medios de pago</h3>
            {lines.map((l, i) => (
              <div className="g3-pay-line" key={l.key}>
                <select aria-label="Medio de pago" value={l.method} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, method: e.target.value } : x)))}>
                  {PAY_METHODS.filter((m) => m !== "SALDO_A_FAVOR" || credit > 0).map((m) => <option key={m} value={m}>{mlabel(m)}</option>)}
                </select>
                <NumInput ariaLabel={`Importe ${mlabel(l.method)}`} value={l.amount} onChange={(n) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, amount: n, auto: false } : x)))} />
                {lines.length > 1 && <button className="tn-link-button" aria-label="Quitar medio" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Quitar</button>}
                {i === lines.length - 1 && diff < 0 && <button className="tn-link-button" onClick={() => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, amount: Math.round(((x.amount || 0) - diff) * 100) / 100, auto: false } : x)))}>Completar</button>}
              </div>))}
            <button className="tn-link-button" onClick={() => setLines((ls) => [...ls, { key: Date.now(), method: "DEBITO", amount: null, auto: false }])}>+ Dividir en otro medio</button>
            {diff < 0 && due > 0 && <div className="tn-note tn-note-warn">Faltan {money(-diff)}</div>}
            {diff > 0 && diff <= cashPaid && <div className="tn-note tn-note-info">Vuelto: <strong>{money(diff)}</strong></div>}
            {diff > cashPaid && <div className="tn-note tn-note-error">Los pagos superan el total y el vuelto solo se da en efectivo.</div>}
            {creditUsed > credit + 0.001 && <div className="tn-note tn-note-error">El cliente tiene {money(credit)} de saldo a favor.</div>}
          </div>

          {shift?.tip_enabled && (
            <div className="g3-tip">
              <h3>Propina <small className="tn-muted">(aparte del total)</small></h3>
              <div className="tn-chips">
                {tipOptions.map((p) => {
                  const amt = roundPeso(sale.total * p / 100);
                  return <button key={p} type="button" className={`tn-chip ${tip === amt && p > 0 ? "is-on" : p === 0 && !tip ? "is-on" : ""}`} onClick={() => setTip(p === 0 ? null : amt)}>{p === 0 ? "Sin propina" : `${p}% · ${money(amt)}`}</button>;
                })}
              </div>
              <div className="g3-pay-line">
                <NumInput ariaLabel="Propina" placeholder="Otro monto" value={tip} onChange={setTip} />
                <select aria-label="Propina pagada con" value={tipMethod} onChange={(e) => setTipMethod(e.target.value)}>
                  {PAY_METHODS.filter((m) => m !== "SALDO_A_FAVOR").map((m) => <option key={m} value={m}>{mlabel(m)}</option>)}
                </select>
              </div>
            </div>)}

          <Field label="Comprobante emitido aparte (opcional)" hint="Turnia no emite facturas. Si hiciste una en ARCA, anotá el número.">
            <input value={fiscal} maxLength={40} onChange={(e) => setFiscal(e.target.value)} />
          </Field>
          {sale.notes && <p className="tn-hint">Nota: {sale.notes}</p>}
        </aside>
      </div>
      {adding && <AddItem sale={sale} modules={modules} pros={pros.data || []} isManager={isManager} onClose={() => setAdding(false)}
        onAdd={async (body) => { const r = await put(`/sales/${sale.id}/items`, "POST", body); return !!r; }} />}
      {discounting && <DiscountForm sale={sale} needsPin={needsPin} busy={busy} onClose={() => setDiscounting(false)}
        onSave={async (body) => { const r = await put(`/sales/${sale.id}/discount`, "POST", body, "Descuento aplicado"); if (r) setDiscounting(false); }} />}
      {discardAsk && <ConfirmModal title="¿Descartar esta venta?" confirmLabel="Descartar" danger onConfirm={discard} onClose={() => setDiscardAsk(false)}>
        Se borra el ticket abierto. No se cobró nada.</ConfirmModal>}
      {flash.node}
    </Modal>
  );
}

// ----------------------------------------------------------------------------------------------------------------
function ItemRow({ it, sale, pros, isManager, busy, onPatch, onRemove }: {
  it: SaleItemT; sale: SaleT; pros: ProLite[]; isManager: boolean; busy: boolean;
  onPatch: (body: Record<string, unknown>, okText?: string) => void; onRemove: () => void;
}) {
  const [editPrice, setEditPrice] = useState(false);
  const [price, setPrice] = useState<number | null>(it.unit_price);
  const packs = sale.pack_options[String(it.id)] || [];
  const mems = sale.membership_options[String(it.id)] || [];
  const stepper = it.kind === "PRODUCTO" || it.kind === "PACK" || it.kind === "AJUSTE";
  return (
    <tr>
      <td>
        <strong>{it.name}</strong>
        {(it.kind === "SERVICIO" || it.kind === "PRODUCTO") && pros.length > 0 && (
          <select className="g3-inline-select" aria-label={`Quién hizo ${it.name}`} value={it.professional_id ?? ""}
            onChange={(e) => onPatch({ professional_id: e.target.value ? Number(e.target.value) : null, set_professional: true })}>
            <option value="">Sin asignar</option>
            {pros.map((p) => <option key={p.id} value={p.id}>{proName(p)}</option>)}
          </select>)}
        {it.paid_with_pack && <div className="tn-row"><Pill tone="violet">{it.membership_id ? "Cubierto por membresía" : "Cubierto por pack"}</Pill>
          <button className="tn-link-button" onClick={() => onPatch({ clear_coverage: true })} disabled={busy}>Sacar</button></div>}
        {!it.paid_with_pack && packs.map((p) => (
          <button key={p.id} className="g3-offer" onClick={() => onPatch({ client_pack_id: p.id }, "Pack aplicado")} disabled={busy}>
            Usar «{p.name}» · quedan {p.left}
          </button>))}
        {!it.paid_with_pack && mems.map((m) => (
          <button key={m.id} className="g3-offer" onClick={() => onPatch({ membership_id: m.id }, "Membresía aplicada")} disabled={busy}>
            Cubrir con la membresía «{m.name}»{m.left !== null ? ` · quedan ${m.left}` : ""}
          </button>))}
      </td>
      <td className="num">
        {stepper ? (
          <span className="g3-stepper">
            <button aria-label="Menos" onClick={() => it.qty > 1 && onPatch({ qty: it.qty - 1 })} disabled={busy || it.qty <= 1}>−</button>
            <span>{it.qty}</span>
            <button aria-label="Más" onClick={() => onPatch({ qty: it.qty + 1 })} disabled={busy}>+</button>
          </span>) : it.qty}
      </td>
      <td className="num">
        {editPrice ? (
          <span className="g3-row-edit"><NumInput ariaLabel="Precio" value={price} onChange={setPrice} className="g3-narrow" />
            <button className="tn-link-button" onClick={() => { if (price !== null) { onPatch({ unit_price: price }, "Precio cambiado"); setEditPrice(false); } }}>OK</button></span>
        ) : (
          <>{money(it.unit_price)}{isManager && !it.paid_with_pack && <button className="tn-link-button" aria-label="Cambiar precio" onClick={() => { setPrice(it.unit_price); setEditPrice(true); }}>Cambiar</button>}</>)}
      </td>
      <td className="num">
        {it.discount > 0 && <small><s>{money(it.qty * it.unit_price)}</s></small>}
        <strong>{money(it.total)}</strong>
      </td>
      <td><button className="g3-linkd" aria-label={`Quitar ${it.name}`} onClick={onRemove} disabled={busy}>Quitar</button></td>
    </tr>
  );
}

// ----------------------------------------------------------------------------------------------------------------
type Tab = "SERVICIO" | "PRODUCTO" | "PACK" | "MEMBRESIA" | "AJUSTE";
function AddItem({ sale, modules, pros, isManager, onClose, onAdd }: {
  sale: SaleT; modules: string[]; pros: ProLite[]; isManager: boolean; onClose: () => void; onAdd: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const hasProducts = modules.includes("productos");
  const hasPacks = modules.includes("packs");
  const [tab, setTab] = useState<Tab>("SERVICIO");
  const [q, setQ] = useState("");
  const [pro, setPro] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const svcs = useLoad<SvcLite[]>("/services");
  const prods = useLoad<ProdLite[]>(hasProducts ? "/products?kind=VENTA&active=true" : null);
  const packs = useLoad<PackTplLite[]>(hasPacks ? "/pack-templates" : null);
  const plans = useLoad<PlanLite[]>(hasPacks ? "/membership-plans" : null);
  const [err, setErr] = useState("");
  const tabs: [Tab, string][] = [["SERVICIO", "Servicios"]];
  if (hasProducts) tabs.push(["PRODUCTO", "Productos"]);
  if (hasPacks) { tabs.push(["PACK", "Packs"]); tabs.push(["MEMBRESIA", "Membresías"]); }
  if (isManager) tabs.push(["AJUSTE", "Otro"]);
  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
  const add = async (body: Record<string, unknown>) => {
    setErr("");
    if (await onAdd({ ...body, professional_id: pro ? Number(pro) : null })) onClose();
  };
  const needsCustomer = (tab === "PACK" || tab === "MEMBRESIA") && !sale.customer;
  const list = useMemo(() => {
    if (tab === "SERVICIO") return (svcs.data || []).filter((s) => match(s.name)).map((s) => ({ id: s.id, title: s.name, sub: "", price: s.price, body: { kind: "SERVICIO", service_id: s.id } }));
    if (tab === "PRODUCTO") return (prods.data || []).filter((p) => match(p.name + (p.brand || ""))).map((p) => ({ id: p.id, title: p.name, sub: `${p.brand ? p.brand + " · " : ""}stock ${p.stock_qty} ${p.unit}`, price: p.price, body: { kind: "PRODUCTO", product_id: p.id } }));
    if (tab === "PACK") return (packs.data || []).filter((p) => match(p.name)).map((p) => ({ id: p.id, title: p.name, sub: `${p.sessions_total} sesiones`, price: p.price, body: { kind: "PACK", pack_template_id: p.id } }));
    if (tab === "MEMBRESIA") return (plans.data || []).filter((p) => match(p.name)).map((p) => ({ id: p.id, title: p.name, sub: `Cada ${p.period_days} días`, price: p.price, body: { kind: "MEMBRESIA", plan_id: p.id } }));
    return [];
  }, [tab, q, svcs.data, prods.data, packs.data, plans.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal eyebrow="CARGAR AL TICKET" title="Agregar ítem" onClose={onClose}>
      {tabs.length > 1 && <Seg value={tab} options={tabs} onChange={(t) => { setTab(t); setQ(""); setErr(""); }} />}
      {tab !== "AJUSTE" && (
        <div className="g3-add-filters">
          <input className="tn-search" placeholder="Buscar" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
          {(tab === "SERVICIO" || tab === "PRODUCTO") && pros.length > 0 && (
            <select aria-label="Quién lo hizo" value={pro} onChange={(e) => setPro(e.target.value)}>
              <option value="">¿Quién lo hizo? (opcional)</option>
              {pros.map((p) => <option key={p.id} value={p.id}>{proName(p)}</option>)}
            </select>)}
        </div>)}
      {needsCustomer && <div className="tn-note tn-note-warn">Primero elegí el cliente: el pack o la membresía queda a su nombre.</div>}
      <ErrorNote text={err} />
      {tab === "AJUSTE" ? (
        <div className="tn-grid-form">
          <Field label="Qué es"><input value={name} maxLength={150} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Precio"><NumInput value={price} onChange={setPrice} ariaLabel="Precio" /></Field>
          <div><button className="primary-button" disabled={name.trim().length < 2 || price === null} onClick={() => add({ kind: "AJUSTE", name: name.trim(), unit_price: price })}>Agregar</button></div>
        </div>
      ) : (
        <div className="g3-pick-list">
          {list.map((r) => (
            <button key={r.id} className="g3-pick" disabled={needsCustomer} onClick={() => add(r.body).catch((e) => setErr(errMsg(e)))}>
              <span><strong>{r.title}</strong>{r.sub && <small>{r.sub}</small>}</span><b>{money(r.price)}</b>
            </button>))}
          {list.length === 0 && <p className="tn-muted">No hay nada para mostrar{q ? " con esa búsqueda" : ""}.</p>}
        </div>)}
    </Modal>
  );
}

// ----------------------------------------------------------------------------------------------------------------
function DiscountForm({ sale, needsPin, busy, onClose, onSave }: {
  sale: SaleT; needsPin: boolean; busy: boolean; onClose: () => void; onSave: (body: Record<string, unknown>) => void;
}) {
  const [item, setItem] = useState("");
  const [kind, setKind] = useState<"PCT" | "MONTO">("PCT");
  const [value, setValue] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const ok = value !== null && value > 0 && reason.trim().length >= 2 && (!needsPin || pin.length >= 4) && (kind !== "PCT" || value <= 100);
  return (
    <Modal eyebrow="DESCUENTO" title="Aplicar descuento" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button>
        <button className="primary-button" disabled={!ok || busy} onClick={() => onSave({ sale_item_id: item ? Number(item) : null, kind, value, reason: reason.trim(), pin: pin || null })}>Aplicar</button></>}>
      <div className="tn-grid-form">
        <Field label="A qué" wide>
          <select value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="">Toda la venta</option>
            {sale.items.filter((i) => !i.paid_with_pack).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Tipo"><Seg value={kind} options={[["PCT", "Porcentaje"], ["MONTO", "Monto en $"]]} onChange={setKind} /></Field>
        <Field label={kind === "PCT" ? "Porcentaje (0 a 100)" : "Monto"}><NumInput value={value} onChange={setValue} ariaLabel="Valor del descuento" /></Field>
        <Field label="Motivo" wide hint="Queda registrado con quién lo autorizó."><input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
        {needsPin && <PinField value={pin} onChange={setPin} what="dar descuentos" />}
      </div>
    </Modal>
  );
}
