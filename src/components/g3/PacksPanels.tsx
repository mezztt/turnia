// Piezas de Packs y membresías: venta, saldo, canje, renovación, pausa, baja y catálogo.
import { useEffect, useState } from "react";
import { appApi, getSessionUser, money, shortDate } from "../../config";
import { Empty, Field, Modal, Pill, Switch } from "../ui";
import { ConfirmModal } from "../r1/common";
import { CustomerPicker, ErrorNote, NumInput, PAY_METHODS, PinField, dmy, dmyhm, errMsg, mlabel, useLoad } from "./common";
import type { CustLite } from "./common";

export interface PackRow {
  id: number; customer_id: number; customer_name: string | null; customer_phone_wa: string | null; template_id: number; name: string; sessions_total: number;
  sessions_used: number; sessions_left: number; price_paid: number; unit_value: number; purchased_on: string; expires_on: string | null; days_left: number | null;
  status: "ACTIVO" | "AGOTADO" | "VENCIDO" | "ANULADO"; token?: string;
}
export interface MemRow {
  id: number; customer_id: number; customer_name: string | null; customer_phone_wa: string | null; plan_id: number; plan_name: string | null; price: number; status: "ACTIVA" | "PAUSADA" | "VENCIDA" | "BAJA";
  started_on: string; paid_until: string | null; next_renewal_on: string | null; days_left: number | null; sessions_used: number; sessions_left: number | null;
  included_sessions: number | null; discount_pct: number | null; paused_on: string | null; baja_code: string | null; notes: string | null; token?: string;
}
export interface Tpl { id: number; name: string; price: number; sessions_total: number; valid_days: number | null; active: boolean; online_sellable: boolean; unit_value: number; services: { service_id: number; name: string; qty: number | null }[]; sold: number }
export interface Plan { id: number; name: string; price: number; period_days: number; included_sessions: number | null; included_service_ids: number[]; included_services: string[]; discount_pct: number | null; active: boolean; online_sellable: boolean; members: number }
interface Svc { id: number; name: string }

export const PACK_TONE: Record<string, string> = { ACTIVO: "green", AGOTADO: "gray", VENCIDO: "red", ANULADO: "gray", ACTIVA: "green", PAUSADA: "blue", VENCIDA: "red", BAJA: "gray" };
export const PACK_LABEL: Record<string, string> = { ACTIVO: "Activo", AGOTADO: "Agotado", VENCIDO: "Vencido", ANULADO: "Anulado", ACTIVA: "Al día", PAUSADA: "En pausa", VENCIDA: "Vencida", BAJA: "De baja" };

// ---------------------------------------------------------------------------------------------------- cobro de la venta
interface PayLine { key: number; method: string; amount: number | null }
export function PayLines({ due, lines, setLines }: { due: number; lines: PayLine[]; setLines: (l: PayLine[]) => void }) {
  const paid = lines.reduce((s, l) => s + (l.amount || 0), 0);
  const diff = Math.round((paid - due) * 100) / 100;
  const cash = lines.filter((l) => l.method === "EFECTIVO").reduce((s, l) => s + (l.amount || 0), 0);
  useEffect(() => {
    if (lines.length === 1 && (lines[0].amount === null || lines[0].key === 1)) setLines([{ ...lines[0], amount: due > 0 ? due : null }]);
  }, [due]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="g3-pay">
      <h3>Cómo paga</h3>
      {lines.map((l) => (
        <div className="g3-pay-line" key={l.key}>
          <select aria-label="Medio de pago" value={l.method} onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, method: e.target.value } : x)))}>
            {PAY_METHODS.filter((m) => m !== "SALDO_A_FAVOR").map((m) => <option key={m} value={m}>{mlabel(m)}</option>)}
          </select>
          <NumInput ariaLabel={`Importe ${mlabel(l.method)}`} value={l.amount} onChange={(n) => setLines(lines.map((x) => (x.key === l.key ? { ...x, amount: n, key: x.key === 1 ? 2 : x.key } : x)))} />
          {lines.length > 1 && <button className="tn-link-button" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>Quitar</button>}
        </div>))}
      <button className="tn-link-button" onClick={() => setLines([...lines, { key: Date.now(), method: "DEBITO", amount: null }])}>+ Dividir en otro medio</button>
      {diff < 0 && due > 0 && <div className="tn-note tn-note-warn">Faltan {money(-diff)}</div>}
      {diff > 0 && diff <= cash && <div className="tn-note tn-note-info">Vuelto: <strong>{money(diff)}</strong></div>}
      {diff > cash && <div className="tn-note tn-note-error">Los pagos superan el total y el vuelto solo se da en efectivo.</div>}
    </div>
  );
}
export const newLines = (): PayLine[] => [{ key: 1, method: "EFECTIVO", amount: null }];
const payments = (ls: PayLine[]) => ls.filter((l) => (l.amount || 0) > 0).map((l) => ({ method: l.method, amount: l.amount, tip_amount: 0 }));
const cents = (n: number) => Math.round(n * 100) / 100;

export function SellPackModal({ templates, onClose, onDone, preset }: { templates: Tpl[]; onClose: () => void; onDone: (msg: string) => void; preset?: CustLite | null }) {
  const user = getSessionUser();
  const needsPin = user?.role === "RECEPCION";
  const [cust, setCust] = useState<CustLite | null>(preset || null);
  const [tpl, setTpl] = useState<number | "">(templates[0]?.id ?? "");
  const [disc, setDisc] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [fiscal, setFiscal] = useState("");
  const [lines, setLines] = useState(newLines());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const t = templates.find((x) => x.id === tpl);
  const due = t ? cents(t.price * (100 - (disc || 0)) / 100) : 0;
  async function go() {
    if (!cust || !t) return;
    setBusy(true); setErr("");
    try {
      await appApi("/client-packs", { method: "POST", body: { customer_id: cust.id, template_id: t.id, payments: payments(lines), discount_pct: disc || null, discount_reason: reason.trim() || null, pin: pin || null, fiscal_ref: fiscal.trim() || null } });
      onDone(`Pack vendido a ${cust.name}`);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="PACKS" title="Vender un pack" size="wide" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="primary-button" disabled={busy || !cust || !t || (!!disc && (reason.trim().length < 2 || (needsPin && pin.length < 4)))} onClick={go}>Cobrar {money(due)}</button></>}>
      <ErrorNote text={err} />
      {templates.length === 0 ? <Empty title="No hay packs en el catálogo">Creá uno en la pestaña «Catálogo».</Empty> : (
        <div className="tn-grid-form">
          <CustomerPicker value={cust} onChange={setCust} />
          <Field label="Pack"><select value={tpl} onChange={(e) => setTpl(Number(e.target.value))}>{templates.map((x) => <option key={x.id} value={x.id}>{x.name} · {money(x.price)}</option>)}</select></Field>
          {t && <p className="tn-hint" style={{ gridColumn: "1 / -1" }}>{t.sessions_total} sesiones{t.valid_days ? `, vencen a los ${t.valid_days} días` : ", sin vencimiento"} · cada sesión vale {money(t.unit_value)}{t.services.length ? ` · ${t.services.map((s) => s.name + (s.qty ? ` x${s.qty}` : "")).join(", ")}` : ""}</p>}
          <Field label="Descuento % (opcional)"><NumInput value={disc} onChange={setDisc} ariaLabel="Descuento" /></Field>
          {!!disc && <Field label="Motivo del descuento"><input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>}
          {!!disc && needsPin && <PinField value={pin} onChange={setPin} what="dar descuentos" />}
          <div style={{ gridColumn: "1 / -1" }}><PayLines due={due} lines={lines} setLines={setLines} /></div>
          <Field label="Comprobante emitido aparte (opcional)" wide><input value={fiscal} maxLength={40} onChange={(e) => setFiscal(e.target.value)} /></Field>
        </div>)}
    </Modal>
  );
}

export function SellMembershipModal({ plans, onClose, onDone }: { plans: Plan[]; onClose: () => void; onDone: (msg: string) => void }) {
  const [cust, setCust] = useState<CustLite | null>(null);
  const [plan, setPlan] = useState<number | "">(plans[0]?.id ?? "");
  const [lines, setLines] = useState(newLines());
  const [fiscal, setFiscal] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const p = plans.find((x) => x.id === plan);
  async function go() {
    if (!cust || !p) return;
    setBusy(true); setErr("");
    try { await appApi("/memberships", { method: "POST", body: { customer_id: cust.id, plan_id: p.id, payments: payments(lines), fiscal_ref: fiscal.trim() || null } }); onDone(`Membresía de ${cust.name} activada`); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="MEMBRESÍAS" title="Alta de membresía" size="wide" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="primary-button" disabled={busy || !cust || !p} onClick={go}>Cobrar {money(p?.price || 0)}</button></>}>
      <ErrorNote text={err} />
      {plans.length === 0 ? <Empty title="No hay planes en el catálogo">Creá uno en la pestaña «Catálogo».</Empty> : (
        <div className="tn-grid-form">
          <CustomerPicker value={cust} onChange={setCust} />
          <Field label="Plan"><select value={plan} onChange={(e) => setPlan(Number(e.target.value))}>{plans.map((x) => <option key={x.id} value={x.id}>{x.name} · {money(x.price)}</option>)}</select></Field>
          {p && <p className="tn-hint" style={{ gridColumn: "1 / -1" }}>Período de {p.period_days} días{p.included_sessions ? ` · ${p.included_sessions} sesiones incluidas` : ""}{p.discount_pct ? ` · ${p.discount_pct}% de descuento en caja` : ""}. No hay débito automático: cada período se cobra acá.</p>}
          <div style={{ gridColumn: "1 / -1" }}><PayLines due={p?.price || 0} lines={lines} setLines={setLines} /></div>
          <Field label="Comprobante emitido aparte (opcional)" wide><input value={fiscal} maxLength={40} onChange={(e) => setFiscal(e.target.value)} /></Field>
        </div>)}
    </Modal>
  );
}

export function RenewModal({ m, onClose, onDone }: { m: MemRow; onClose: () => void; onDone: (msg: string) => void }) {
  const [lines, setLines] = useState(newLines());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setErr("");
    try { await appApi(`/memberships/${m.id}/renew`, { method: "POST", body: { payments: payments(lines) } }); onDone(`Membresía de ${m.customer_name} renovada`); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow={(m.customer_name || "").toUpperCase()} title={`Renovar «${m.plan_name}»`} onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="primary-button" disabled={busy} onClick={go}>Cobrar {money(m.price)}</button></>}>
      <ErrorNote text={err} />
      <p className="tn-muted">{m.paid_until ? `Pagada hasta el ${dmy(m.paid_until)}.` : ""} El período nuevo empieza {m.days_left !== null && m.days_left >= 0 ? "al terminar el actual" : "hoy"}.</p>
      <PayLines due={m.price} lines={lines} setLines={setLines} />
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------- detalle de un pack
interface PackDetail extends PackRow { services: { service_id: number; name: string; qty: number | null }[]; redemptions: { id: number; service: string; redeemed_at: string; reverted_at: string | null; unit_value: number; charged: boolean }[] }
interface Redeemable { appointment_item_id: number; appointment_id: number; service_id: number; name: string; start_at: string }

export function PackDetailModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { data, error, reload } = useLoad<PackDetail>(`/client-packs/${id}`);
  const [canje, setCanje] = useState(false);
  const rd = useLoad<Redeemable[]>(canje ? `/client-packs/${id}/redeemable` : null);
  const [err, setErr] = useState("");
  const [revert, setRevert] = useState<number | null>(null);
  async function redeem(r: Redeemable) {
    try { await appApi(`/client-packs/${id}/redeem`, { method: "POST", body: { service_id: r.service_id, appointment_item_id: r.appointment_item_id } }); setCanje(false); await reload(); onChanged(); } catch (e) { setErr(errMsg(e)); }
  }
  async function doRevert() {
    const rid = revert; setRevert(null);
    if (rid === null) return;
    try { await appApi(`/pack-redemptions/${rid}/revert`, { method: "POST" }); await reload(); onChanged(); } catch (e) { setErr(errMsg(e)); }
  }
  if (!data) return <Modal title="Pack" onClose={onClose}><ErrorNote text={error} /></Modal>;
  return (
    <Modal eyebrow={(data.customer_name || "").toUpperCase()} title={data.name} size="wide" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Cerrar</button>
        {data.status === "ACTIVO" && <button className="primary-button" onClick={() => setCanje(true)}>Canjear una sesión</button>}</>}>
      <ErrorNote text={err} />
      <div className="tn-row" style={{ marginBottom: 12 }}>
        <Pill tone={PACK_TONE[data.status]}>{PACK_LABEL[data.status]}</Pill>
        <strong>{data.sessions_left} de {data.sessions_total} sesiones disponibles</strong>
        <span className="tn-muted">{data.expires_on ? `Vence el ${dmy(data.expires_on)}` : "Sin vencimiento"} · comprado el {dmy(data.purchased_on)} · {money(data.price_paid)}</span>
      </div>
      {data.services.length > 0 && <p className="tn-hint">Incluye: {data.services.map((s) => s.name + (s.qty ? ` (${s.qty})` : "")).join(", ")}</p>}
      {canje ? (
        <div className="tn-card">
          <h2>¿En qué turno se usa?</h2>
          {rd.loading && <p className="tn-muted">Buscando turnos...</p>}
          {rd.data && rd.data.length === 0 && <Empty title="No hay turnos del cliente para canjear">Cargá el turno en la agenda, o armá una venta suelta en la caja y aplicale el pack al cobrar.</Empty>}
          <ul className="tn-list">
            {(rd.data || []).map((r) => <li key={r.appointment_item_id} className="is-click" onClick={() => redeem(r)}><div className="tn-list-main"><strong>{r.name}</strong><small>{dmyhm(r.start_at)}</small></div><button className="primary-button g3-small">Canjear acá</button></li>)}
          </ul>
          <button className="tn-link-button" onClick={() => setCanje(false)}>Cancelar</button>
        </div>) : (
        <div className="tn-card">
          <h2>Sesiones usadas</h2>
          {data.redemptions.length === 0 ? <p className="tn-muted">Todavía no se usó ninguna sesión.</p> : (
            <ul className="tn-list">
              {data.redemptions.map((r) => (
                <li key={r.id}><div className="tn-list-main"><strong>{r.service}</strong><small>{dmyhm(r.redeemed_at)}{r.reverted_at ? ` · revertida el ${dmy(r.reverted_at)}` : ""}{r.charged ? " · ya cobrada en caja" : ""}</small></div>
                  {!r.reverted_at && !r.charged && <button className="g3-linkd" onClick={() => setRevert(r.id)}>Revertir</button>}</li>))}
            </ul>)}
        </div>)}
      {revert !== null && <ConfirmModal title="¿Revertir este canje?" confirmLabel="Revertir" danger onConfirm={doRevert} onClose={() => setRevert(null)}>La sesión vuelve al saldo del pack.</ConfirmModal>}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------- membresías: pausa y baja
export function CancelMembershipModal({ m, onClose, onDone }: { m: MemRow; onClose: () => void; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState("");
  async function go() {
    try { const r = await appApi<{ message: string }>(`/memberships/${m.id}/cancel`, { method: "POST", body: { reason: reason.trim() || null, request_code: code.trim() || null } }); setResult(r.message); } catch (e) { setErr(errMsg(e)); }
  }
  if (result) return <Modal eyebrow="BAJA REGISTRADA" title="Listo" onClose={() => onDone(result)} footer={<button className="primary-button" onClick={() => onDone(result)}>Entendido</button>}><p>{result}</p><p className="tn-hint">Pasale el código al cliente como constancia.</p></Modal>;
  return (
    <Modal eyebrow={(m.customer_name || "").toUpperCase()} title={`Dar de baja «${m.plan_name}»`} onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="tn-danger-button" onClick={go}>Dar de baja</button></>}>
      <ErrorNote text={err} />
      <p className="tn-muted">Desde hoy queda de baja y no se cobra el período siguiente. Se respeta lo ya pagado{m.paid_until ? ` hasta el ${dmy(m.paid_until)}` : ""}. La baja no necesita ningún trámite previo y el cliente recibe un código.</p>
      <div className="tn-grid-form">
        <Field label="Motivo (opcional)"><input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
        <Field label="Código del pedido online (opcional)" hint="Si el cliente la pidió por el botón de baja de la web, pegá el código y se marca resuelto."><input value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} placeholder="BAJ-AB12CD" /></Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------- catálogo
export function TemplateForm({ t, services, onClose, onSaved }: { t: Tpl | null; services: Svc[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: t?.name || "", price: t?.price ?? null as number | null, sessions_total: t?.sessions_total ?? 5 as number | null, valid_days: t?.valid_days ?? null as number | null,
    active: t?.active ?? true, online_sellable: t?.online_sellable ?? false });
  const [sel, setSel] = useState<Record<number, number | null>>(Object.fromEntries((t?.services || []).map((s) => [s.service_id, s.qty])));
  const [err, setErr] = useState("");
  async function save() {
    try {
      const body = { ...f, price: f.price ?? 0, services: Object.entries(sel).map(([id, qty]) => ({ service_id: Number(id), qty: qty || null })) };
      await appApi(t ? `/pack-templates/${t.id}` : "/pack-templates", { method: t ? "PUT" : "POST", body });
      onSaved();
    } catch (e) { setErr(errMsg(e)); }
  }
  return (
    <Modal eyebrow="CATÁLOGO" title={t ? "Editar pack" : "Nuevo pack"} size="wide" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="primary-button" disabled={f.name.trim().length < 2 || !f.sessions_total} onClick={save}>Guardar</button></>}>
      <ErrorNote text={err} />
      <div className="tn-grid-form">
        <Field label="Nombre"><input value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder="Ej.: Pack 6 sesiones depilación" /></Field>
        <Field label="Precio del pack"><NumInput value={f.price} onChange={(n) => setF({ ...f, price: n })} ariaLabel="Precio" /></Field>
        <Field label="Cantidad de sesiones"><NumInput value={f.sessions_total} onChange={(n) => setF({ ...f, sessions_total: n === null ? null : Math.round(n) })} ariaLabel="Sesiones" /></Field>
        <Field label="Vence a los (días)" hint="Vacío = no vence."><NumInput value={f.valid_days} onChange={(n) => setF({ ...f, valid_days: n === null ? null : Math.round(n) })} ariaLabel="Días de vigencia" /></Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="g3-label">Servicios incluidos <small className="tn-muted">(si no marcás ninguno, sirve para cualquiera)</small></label>
          <div className="g3-svc-pick">
            {services.map((s) => (
              <div key={s.id} className="g3-svc-row">
                <label className="g3-check"><input type="checkbox" checked={s.id in sel} onChange={(e) => setSel((x) => { const n = { ...x }; if (e.target.checked) n[s.id] = null; else delete n[s.id]; return n; })} /><span>{s.name}</span></label>
                {s.id in sel && <span className="tn-row"><NumInput className="g3-narrow" ariaLabel={`Sesiones de ${s.name}`} placeholder="Todas" value={sel[s.id]} onChange={(n) => setSel((x) => ({ ...x, [s.id]: n === null ? null : Math.round(n) }))} /><small className="tn-muted">sesiones</small></span>}
              </div>))}
          </div>
        </div>
        <div style={{ gridColumn: "1 / -1" }} className="tn-stack">
          <Switch on={f.active} onChange={(b) => setF({ ...f, active: b })} label="Se puede vender" hint="Si lo apagás, no aparece en la caja pero los ya vendidos siguen funcionando." />
        </div>
      </div>
    </Modal>
  );
}

export function PlanForm({ p, services, onClose, onSaved }: { p: Plan | null; services: Svc[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: p?.name || "", price: p?.price ?? null as number | null, period_days: p?.period_days ?? 30 as number | null, included_sessions: p?.included_sessions ?? null as number | null,
    discount_pct: p?.discount_pct ?? null as number | null, active: p?.active ?? true, online_sellable: p?.online_sellable ?? false });
  const [ids, setIds] = useState<number[]>(p?.included_service_ids || []);
  const [err, setErr] = useState("");
  async function save() {
    try { await appApi(p ? `/membership-plans/${p.id}` : "/membership-plans", { method: p ? "PUT" : "POST", body: { ...f, price: f.price ?? 0, period_days: f.period_days || 30, included_service_ids: ids } }); onSaved(); } catch (e) { setErr(errMsg(e)); }
  }
  return (
    <Modal eyebrow="CATÁLOGO" title={p ? "Editar plan" : "Nuevo plan de membresía"} size="wide" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="primary-button" disabled={f.name.trim().length < 2} onClick={save}>Guardar</button></>}>
      <ErrorNote text={err} />
      <div className="tn-grid-form">
        <Field label="Nombre"><input value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder="Ej.: Barba y corte mensual" /></Field>
        <Field label="Precio por período"><NumInput value={f.price} onChange={(n) => setF({ ...f, price: n })} ariaLabel="Precio" /></Field>
        <Field label="Duración del período (días)"><NumInput value={f.period_days} onChange={(n) => setF({ ...f, period_days: n === null ? null : Math.round(n) })} ariaLabel="Días" /></Field>
        <Field label="Sesiones incluidas por período" hint="Vacío = solo da descuento. No se acumulan al período siguiente."><NumInput value={f.included_sessions} onChange={(n) => setF({ ...f, included_sessions: n === null ? null : Math.round(n) })} ariaLabel="Sesiones incluidas" /></Field>
        <Field label="Descuento % en caja" hint="Se aplica solo a los servicios del plan."><NumInput value={f.discount_pct} onChange={(n) => setF({ ...f, discount_pct: n })} ariaLabel="Descuento" /></Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="g3-label">Servicios del plan <small className="tn-muted">(si no marcás ninguno, vale para todos)</small></label>
          <div className="g3-svc-pick">
            {services.map((s) => (
              <label key={s.id} className="g3-check"><input type="checkbox" checked={ids.includes(s.id)} onChange={(e) => setIds((x) => (e.target.checked ? [...x, s.id] : x.filter((i) => i !== s.id)))} /><span>{s.name}</span></label>))}
          </div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}><Switch on={f.active} onChange={(b) => setF({ ...f, active: b })} label="Se puede vender" /></div>
      </div>
    </Modal>
  );
}

export function CatalogTab({ canEdit, version, onChanged }: { canEdit: boolean; version: number; onChanged: () => void }) {
  const tpls = useLoad<Tpl[]>(`/pack-templates?all=true&v=${version}`);
  const plans = useLoad<Plan[]>(`/membership-plans?all=true&v=${version}`);
  const svcs = useLoad<Svc[]>("/services");
  const [tf, setTf] = useState<Tpl | "new" | null>(null);
  const [pf, setPf] = useState<Plan | "new" | null>(null);
  return (
    <div className="tn-stack">
      <div className="tn-card">
        <div className="tn-card-head"><div><h2>Packs de sesiones</h2><p>Se pagan una vez y se canjean de a una sesión.</p></div>{canEdit && <button className="primary-button" onClick={() => setTf("new")}>Nuevo pack</button>}</div>
        <ErrorNote text={tpls.error} />
        {tpls.data && tpls.data.length === 0 && <Empty title="Todavía no hay packs">Ej.: «5 sesiones de limpieza facial» con vencimiento a 6 meses.</Empty>}
        <ul className="tn-list">
          {(tpls.data || []).map((t) => (
            <li key={t.id}><div className="tn-list-main"><strong>{t.name} {!t.active && <Pill tone="gray">No se vende</Pill>}</strong>
              <small>{t.sessions_total} sesiones · {money(t.unit_value)} c/u{t.valid_days ? ` · vence a los ${t.valid_days} días` : ""}{t.services.length ? ` · ${t.services.map((s) => s.name).join(", ")}` : ""} · {t.sold} vendidos</small></div>
              <span className="tn-list-amount">{money(t.price)}</span>{canEdit && <button className="secondary-button g3-small" onClick={() => setTf(t)}>Editar</button>}</li>))}
        </ul>
      </div>
      <div className="tn-card">
        <div className="tn-card-head"><div><h2>Planes de membresía</h2><p>Se cobran cada período, a mano. Pueden incluir sesiones y/o descuento.</p></div>{canEdit && <button className="primary-button" onClick={() => setPf("new")}>Nuevo plan</button>}</div>
        <ErrorNote text={plans.error} />
        {plans.data && plans.data.length === 0 && <Empty title="Todavía no hay planes">Ej.: «Barba y corte mensual: 2 sesiones por $18.000».</Empty>}
        <ul className="tn-list">
          {(plans.data || []).map((p) => (
            <li key={p.id}><div className="tn-list-main"><strong>{p.name} {!p.active && <Pill tone="gray">No se vende</Pill>}</strong>
              <small>Cada {p.period_days} días{p.included_sessions ? ` · ${p.included_sessions} sesiones` : ""}{p.discount_pct ? ` · ${p.discount_pct}% de descuento` : ""}{p.included_services.length ? ` · ${p.included_services.join(", ")}` : ""} · {p.members} socios</small></div>
              <span className="tn-list-amount">{money(p.price)}</span>{canEdit && <button className="secondary-button g3-small" onClick={() => setPf(p)}>Editar</button>}</li>))}
        </ul>
      </div>
      {tf && <TemplateForm t={tf === "new" ? null : tf} services={svcs.data || []} onClose={() => setTf(null)} onSaved={() => { setTf(null); onChanged(); }} />}
      {pf && <PlanForm p={pf === "new" ? null : pf} services={svcs.data || []} onClose={() => setPf(null)} onSaved={() => { setPf(null); onChanged(); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- mensajes
export function packMsg(p: PackRow, local: string): string {
  const first = (p.customer_name || "").split(" ")[0];
  if (p.days_left !== null && p.days_left >= 0) return `Hola ${first}, te escribimos de ${local}. Tu pack «${p.name}» vence el ${shortDate(p.expires_on)} y todavía te quedan ${p.sessions_left} sesiones. ¿Querés reservar tu próximo turno?`;
  return `Hola ${first}, te escribimos de ${local}. Tu pack «${p.name}» te deja ${p.sessions_left} sesiones disponibles. ¿Te reservamos un turno?`;
}
export function memMsg(m: MemRow, local: string): string {
  const first = (m.customer_name || "").split(" ")[0];
  const venc = m.days_left !== null && m.days_left < 0 ? `venció el ${shortDate(m.paid_until)}` : `vence el ${shortDate(m.paid_until)}`;
  return `Hola ${first}, te escribimos de ${local}. Tu membresía «${m.plan_name}» ${venc}. ¿La renovamos?`;
}
