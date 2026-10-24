// Piezas de Comisiones: período a liquidar, líneas, ajustes, reglas con herencia visible y liquidaciones cerradas.
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { appApi, getSessionUser, money } from "../../config";
import { Empty, Field, Modal, Pill, Seg, Switch } from "../ui";
import { ConfirmModal } from "../r1/common";
import { printSettlement } from "../../pages/print/g3print";
import type { SettlementPrint } from "../../pages/print/g3print";
import { ErrorNote, Kpi, NumInput, dmy, errMsg, todayKey, useLoad } from "./common";

export interface Line { id: number; date: string; sale_id: number | null; sale_number: number | null; item: string; kind: string; base: number; rate: number; amount: number; with_pack: boolean }
export interface Adj { id: number; professional_id: number; date: string; kind: "ADELANTO" | "DESCUENTO" | "BONO"; amount: number; reason: string | null; settlement_id: number | null }
export interface Preview {
  professional_id: number; professional_name: string; from_date: string; to_date: string; gross_base: number; commission_total: number; tips_total: number;
  advances: number; discounts: number; bonus: number; adjustments_total: number; total_to_pay: number; lines: Line[]; adjustments: Adj[];
}
export interface Settlement {
  id: number; professional_id: number; professional_name: string; from_date: string; to_date: string; status: "CERRADA" | "PAGADA"; gross_base: number;
  commission_total: number; tips_total: number; adjustments_total: number; total_to_pay: number; paid_at: string | null; notes: string | null;
  lines?: Line[]; adjustments?: Adj[]; advances?: number; discounts?: number; bonus?: number;
}
export interface Rule { id?: number; professional_id: number | null; scope: "TODO" | "SERVICIO" | "CATEGORIA" | "PRODUCTO"; scope_id: number | null; kind: "PCT" | "FIJO"; value: number; applies_to: "SERVICIO" | "PRODUCTO"; priority: number; active: boolean }
export interface RulesData {
  rules: Rule[]; professionals: { id: number; name: string; default_pct: number | null }[]; services: { id: number; name: string; category_id: number | null }[];
  categories: { id: number; name: string }[]; products: { id: number; name: string }[]; settings: { base_mode: string; deduct_fee_pct: number; tips_to_professional: boolean };
}

const monthStart = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function periodPreset(p: string): [string, string] {
  const now = new Date();
  if (p === "anterior") return [monthStart(new Date(now.getFullYear(), now.getMonth() - 1, 1)), dayStr(new Date(now.getFullYear(), now.getMonth(), 0))];
  if (p === "quincena") return now.getDate() <= 15 ? [monthStart(now), `${monthStart(now).slice(0, 8)}15`] : [`${monthStart(now).slice(0, 8)}16`, dayStr(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
  return [monthStart(now), dayStr(now)];
}

export function PeriodBar({ range, onChange, children }: { range: [string, string]; onChange: (r: [string, string]) => void; children?: ReactNode }) {
  return (
    <div className="tn-filters g3-period" data-tour="comisiones-periodo">
      <select aria-label="Período" defaultValue="mes" onChange={(e) => onChange(periodPreset(e.target.value))}>
        <option value="mes">Este mes</option><option value="anterior">Mes anterior</option><option value="quincena">Quincena en curso</option>
      </select>
      <label>Desde <input type="date" value={range[0]} max={range[1]} onChange={(e) => e.target.value && onChange([e.target.value, range[1]])} /></label>
      <label>Hasta <input type="date" value={range[1]} min={range[0]} onChange={(e) => e.target.value && onChange([range[0], e.target.value])} /></label>
      {children}
    </div>
  );
}

export function LinesTable({ lines }: { lines: Line[] }) {
  if (lines.length === 0) return <Empty title="Sin comisiones en el período">Se generan al cobrar una venta con un profesional asignado y una regla que le corresponda.</Empty>;
  return (
    <div className="tn-table-wrap g3-scroll">
      <table className="tn-table">
        <thead><tr><th>Fecha</th><th>Venta</th><th>Detalle</th><th className="num">Base</th><th className="num">Regla</th><th className="num">Comisión</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td>{dmy(l.date)}</td><td>{l.sale_number ? `#${l.sale_number}` : "—"}</td>
              <td>{l.item}{l.with_pack && <Pill tone="violet">Canje de pack</Pill>}{l.kind === "PROP" && <Pill tone="blue">Propina</Pill>}</td>
              <td className="num">{l.kind === "PROP" ? "—" : money(l.base)}</td>
              <td className="num">{l.kind === "PROP" ? "—" : l.kind === "FIJO" ? `${money(l.rate)} fijo` : `${l.rate}%`}</td>
              <td className="num"><strong>{money(l.amount)}</strong></td>
            </tr>))}
        </tbody>
      </table>
    </div>
  );
}

export function TotalsKpis({ p }: { p: { commission_total: number; tips_total: number; adjustments_total: number; total_to_pay: number } }) {
  return (
    <div className="tn-kpis">
      <Kpi label="Comisiones" value={money(p.commission_total)} />
      <Kpi label="Propinas" value={money(p.tips_total)} hint="se acreditan a quien atendió" />
      <Kpi label="Adelantos, descuentos y bonos" value={(p.adjustments_total > 0 ? "+" : "") + money(p.adjustments_total)} />
      <Kpi label="A pagar" value={money(p.total_to_pay)} />
    </div>
  );
}

export function AdjustmentList({ adjs, canEdit, onRemoved }: { adjs: Adj[]; canEdit: boolean; onRemoved: () => void }) {
  const [err, setErr] = useState("");
  if (adjs.length === 0) return null;
  return (
    <div className="tn-card">
      <h2>Adelantos, descuentos y bonos</h2>
      <ErrorNote text={err} />
      <ul className="tn-list">
        {adjs.map((a) => (
          <li key={a.id}>
            <div className="tn-list-main"><strong>{a.kind === "ADELANTO" ? "Adelanto" : a.kind === "BONO" ? "Bono" : "Descuento"} · {dmy(a.date)}</strong><small>{a.reason || "Sin motivo"}</small></div>
            <span className="tn-list-amount">{a.kind === "BONO" ? "+" : "-"}{money(a.amount)}</span>
            {canEdit && <button className="g3-linkd" onClick={async () => { try { await appApi(`/commissions/adjustments/${a.id}`, { method: "DELETE" }); onRemoved(); } catch (e) { setErr(errMsg(e)); } }}>Quitar</button>}
          </li>))}
      </ul>
    </div>
  );
}

export function AdjustmentModal({ professionalId, professionalName, onClose, onSaved }: { professionalId: number; professionalName: string; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<"ADELANTO" | "DESCUENTO" | "BONO">("ADELANTO");
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayKey());
  const [err, setErr] = useState("");
  async function save() {
    try { await appApi("/commissions/adjustments", { method: "POST", body: { professional_id: professionalId, kind, amount, reason: reason.trim() || null, date } }); onSaved(); } catch (e) { setErr(errMsg(e)); }
  }
  return (
    <Modal eyebrow={professionalName.toUpperCase()} title="Adelanto, descuento o bono" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="primary-button" disabled={!amount || (kind !== "ADELANTO" && reason.trim().length < 2)} onClick={save}>Registrar</button></>}>
      <ErrorNote text={err} />
      <div className="tn-grid-form">
        <Field label="Tipo" wide><Seg value={kind} options={[["ADELANTO", "Adelanto"], ["DESCUENTO", "Descuento"], ["BONO", "Bono"]]} onChange={setKind} /></Field>
        <Field label="Importe"><NumInput value={amount} onChange={setAmount} ariaLabel="Importe" autoFocus /></Field>
        <Field label="Fecha"><input type="date" value={date} max={todayKey()} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
        <Field label={kind === "ADELANTO" ? "Motivo (opcional)" : "Motivo"} wide><input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      <p className="tn-hint">Entra en la próxima liquidación cerrada de esta persona: los adelantos y descuentos restan, los bonos suman.</p>
    </Modal>
  );
}

// ----------------------------------------------------------------------------------------------------------------
export function SettlementModal({ id, canManage, onClose, onChanged }: { id: number; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const user = getSessionUser();
  const { data: s, error, reload } = useLoad<Settlement>(canManage ? `/commissions/settlements/${id}` : null);
  const [ask, setAsk] = useState<"pay" | "reopen" | null>(null);
  const [err, setErr] = useState("");
  async function run(path: string, ok: () => void) {
    try { await appApi(path, { method: "POST" }); ok(); await reload(); onChanged(); } catch (e) { setErr(errMsg(e)); }
    setAsk(null);
  }
  async function print() {
    try { printSettlement(await appApi<SettlementPrint>(`/commissions/settlements/${id}/print`)); } catch (e) { setErr(errMsg(e)); }
  }
  if (!s) return <Modal title="Liquidación" onClose={onClose}><ErrorNote text={error} /></Modal>;
  return (
    <Modal eyebrow="LIQUIDACIÓN" title={`${s.professional_name} · ${dmy(s.from_date)} a ${dmy(s.to_date)}`} size="xl" onClose={onClose}
      footer={<><button className="secondary-button" onClick={print}>Imprimir</button>
        {canManage && s.status === "CERRADA" && user?.role === "ADMINISTRADOR" && <button className="g3-linkd" onClick={() => setAsk("reopen")}>Reabrir</button>}
        {canManage && s.status === "CERRADA" && <button className="primary-button" onClick={() => setAsk("pay")}>Marcar como pagada</button>}
        <button className="secondary-button" onClick={onClose}>Cerrar</button></>}>
      <ErrorNote text={err} />
      <div className="tn-row" style={{ marginBottom: 12 }}><Pill tone={s.status === "PAGADA" ? "green" : "orange"}>{s.status === "PAGADA" ? `Pagada el ${dmy(s.paid_at)}` : "Cerrada, falta pagar"}</Pill></div>
      <TotalsKpis p={s} />
      <LinesTable lines={s.lines || []} />
      {s.adjustments && s.adjustments.length > 0 && <div style={{ marginTop: 14 }}><AdjustmentList adjs={s.adjustments} canEdit={false} onRemoved={() => undefined} /></div>}
      <p className="tn-hint">Cálculo de gestión del local: no es recibo de sueldo ni incluye cargas sociales. Documento no válido como factura.</p>
      {ask === "pay" && <ConfirmModal title="¿Marcar como pagada?" confirmLabel="Marcar pagada" onConfirm={() => run(`/commissions/settlements/${id}/pay`, () => undefined)} onClose={() => setAsk(null)}>
        Queda registrado que le pagaste {money(s.total_to_pay)} a {s.professional_name}.</ConfirmModal>}
      {ask === "reopen" && <ConfirmModal title="¿Reabrir la liquidación?" danger confirmLabel="Reabrir" onConfirm={() => run(`/commissions/settlements/${id}/reopen`, onClose)} onClose={() => setAsk(null)}>
        Las líneas vuelven a quedar libres para liquidar de nuevo. Solo se puede si todavía no se pagó.</ConfirmModal>}
    </Modal>
  );
}

export function SettlementsTab({ version, onChanged, canManage }: { version: number; onChanged: () => void; canManage: boolean }) {
  const { data, error } = useLoad<Settlement[]>(`/commissions/settlements?v=${version}`);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="tn-stack">
      <ErrorNote text={error} />
      {data && data.length === 0 && <Empty title="Todavía no cerraste ninguna liquidación">En «Liquidar» elegís el período y el profesional y cerrás el período.</Empty>}
      {data && data.length > 0 && (
        <div className="tn-table-wrap">
          <table className="tn-table">
            <thead><tr><th>Profesional</th><th>Período</th><th className="num">Comisiones</th><th className="num">Propinas</th><th className="num">A pagar</th><th>Estado</th></tr></thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className="is-click" tabIndex={0} onClick={() => setOpen(s.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(s.id)}>
                  <td><strong>{s.professional_name}</strong></td><td>{dmy(s.from_date)} a {dmy(s.to_date)}</td>
                  <td className="num">{money(s.commission_total)}</td><td className="num">{money(s.tips_total)}</td><td className="num"><strong>{money(s.total_to_pay)}</strong></td>
                  <td><Pill tone={s.status === "PAGADA" ? "green" : "orange"}>{s.status === "PAGADA" ? "Pagada" : "Por pagar"}</Pill></td>
                </tr>))}
            </tbody>
          </table>
        </div>)}
      {open !== null && <SettlementModal id={open} canManage={canManage} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </div>
  );
}

// ----------------------------------------------------------------------------------------------------------------
type Eff = { label: string; origin: string } | null;
/** Misma elección que el backend (H.27): más específica gana; empate, mayor prioridad. La base del profesional vale como «profesional + todo» de prioridad baja. */
export function effective(d: RulesData, rules: Rule[], proId: number, svcId: number): Eff {
  const svc = d.services.find((s) => s.id === svcId);
  const pro = d.professionals.find((p) => p.id === proId);
  let best: { key: [number, number, number]; r: Rule | null; pct?: number } | null = null;
  for (const [idx, r] of rules.entries()) {
    if (!r.active || r.applies_to !== "SERVICIO") continue;
    if (r.professional_id !== null && r.professional_id !== proId) continue;
    const own = r.professional_id !== null;
    let rank = 0;
    if (r.scope === "TODO") rank = own ? 3 : 6;
    else if (r.scope === "SERVICIO" && r.scope_id === svcId) rank = own ? 1 : 4;
    else if (r.scope === "CATEGORIA" && svc?.category_id && r.scope_id === svc.category_id) rank = own ? 2 : 5;
    else continue;
    const key: [number, number, number] = [rank, -r.priority, -(r.id ?? idx + 1)];
    if (!best || cmp(key, best.key) < 0) best = { key, r };
  }
  if (pro && pro.default_pct !== null) {
    const key: [number, number, number] = [3, 1, 0];
    if (!best || cmp(key, best.key) < 0) best = { key, r: null, pct: pro.default_pct };
  }
  if (!best) return null;
  const b: { key: [number, number, number]; r: Rule | null; pct?: number } = best;
  if (!b.r) return { label: `${b.pct}%`, origin: "Base del profesional" };
  const label = b.r.kind === "FIJO" ? `${money(b.r.value)} fijo` : `${b.r.value}%`;
  const origin = ({ 1: "Regla propia del servicio", 2: "Regla propia de la categoría", 3: "Regla propia general", 4: "Regla del local para el servicio", 5: "Regla del local para la categoría", 6: "Regla general del local" } as Record<number, string>)[b.key[0]];
  return { label, origin };
}
const cmp = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

const BASES: [string, string, string][] = [
  ["PRECIO_COBRADO", "Lo que se cobró", "Precio después de descuentos."], ["SIN_DESCUENTO", "Precio de lista", "Ignora los descuentos que hizo el local."],
  ["NETO_INSUMOS", "Neto de insumos", "Lo cobrado menos el costo de insumos y la comisión del medio de pago."],
];

export function RulesTab({ canEdit, onSaved }: { canEdit: boolean; onSaved: () => void }) {
  const { data, error, reload } = useLoad<RulesData>("/commission-rules");
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const list = rules ?? data?.rules ?? [];
  const dirty = rules !== null;
  const edit = (i: number, patch: Partial<Rule>) => setRules(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  async function save() {
    setSaving(true); setErr(""); setOk("");
    try { await appApi("/commission-rules", { method: "PUT", body: { rules: list.map((r) => ({ ...r, id: undefined })) } }); setRules(null); await reload(); setOk("Reglas guardadas. Valen para lo que se cobre desde ahora."); onSaved(); } catch (e) { setErr(errMsg(e)); } finally { setSaving(false); }
  }
  async function saveSettings(patch: Record<string, unknown>) {
    setErr("");
    try { await appApi("/commission-settings", { method: "PUT", body: patch }); await reload(); } catch (e) { setErr(errMsg(e)); }
  }
  const matrix = useMemo(() => (data ? data.professionals.map((p) => ({ p, cells: data.services.map((s) => effective(data, list, p.id, s.id)) })) : []), [data, list]);
  if (!data) return <ErrorNote text={error} />;
  const scopeOptions = (r: Rule) => {
    if (r.applies_to === "PRODUCTO") return data.products;
    return r.scope === "CATEGORIA" ? data.categories : data.services;
  };
  return (
    <div className="tn-stack">
      <ErrorNote text={err} />
      {ok && <div className="tn-note tn-note-info">{ok}</div>}
      <div className="tn-card">
        <div className="tn-card-head"><div><h2>Cómo se calcula</h2><p>Sobre qué importe se aplica el porcentaje.</p></div></div>
        <Seg value={data.settings.base_mode} options={BASES.map(([k, l]) => [k, l] as [string, string])} onChange={(k) => canEdit && saveSettings({ base_mode: k })} />
        <p className="tn-hint">{BASES.find((b) => b[0] === data.settings.base_mode)?.[2]}</p>
        {data.settings.base_mode === "NETO_INSUMOS" && (
          <Field label="Comisión del medio de pago a descontar (%)"><NumInput className="g3-narrow" ariaLabel="Comisión del medio de pago" value={data.settings.deduct_fee_pct} onChange={(n) => canEdit && n !== null && saveSettings({ deduct_fee_pct: n })} /></Field>)}
        <Switch on={data.settings.tips_to_professional} onChange={(b) => canEdit && saveSettings({ tips_to_professional: b })} label="La propina es de quien atendió" hint="Se acredita en la liquidación. Si no, queda para el local." />
        {!canEdit && <p className="tn-hint">Solo el administrador cambia esto.</p>}
      </div>

      <div className="tn-card" data-tour="comisiones-reglas">
        <div className="tn-card-head"><div><h2>Reglas</h2><p>Gana la más específica: profesional + servicio, después profesional + categoría, profesional + todo, y recién ahí las del local.</p></div>
          {canEdit && <button className="secondary-button" onClick={() => setRules([...list, { professional_id: null, scope: "TODO", scope_id: null, kind: "PCT", value: 40, applies_to: "SERVICIO", priority: 0, active: true }])}>+ Nueva regla</button>}</div>
        {list.length === 0 && <Empty title="Todavía no hay reglas">Sin reglas, cada profesional cobra el porcentaje base que tenga cargado en Servicios y equipo (si lo hay).</Empty>}
        <div className="g3-rules">
          {list.map((r, i) => (
            <div className="g3-rule" key={r.id ?? `n${i}`}>
              <select aria-label="Profesional" disabled={!canEdit} value={r.professional_id ?? ""} onChange={(e) => edit(i, { professional_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Todo el local</option>{data.professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select aria-label="Aplica a" disabled={!canEdit} value={r.applies_to === "PRODUCTO" ? "PRODUCTO" : r.scope} onChange={(e) => {
                const v = e.target.value;
                edit(i, v === "PRODUCTO" ? { applies_to: "PRODUCTO", scope: "PRODUCTO", scope_id: null } : { applies_to: "SERVICIO", scope: v as Rule["scope"], scope_id: null });
              }}>
                <option value="TODO">Todos los servicios</option><option value="CATEGORIA">Una categoría</option><option value="SERVICIO">Un servicio</option><option value="PRODUCTO">Un producto vendido</option>
              </select>
              {r.scope !== "TODO" ? (
                <select aria-label="Cuál" disabled={!canEdit} value={r.scope_id ?? ""} onChange={(e) => edit(i, { scope_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Elegí…</option>{scopeOptions(r).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>) : <span className="tn-muted">—</span>}
              <select aria-label="Tipo" disabled={!canEdit} value={r.kind} onChange={(e) => edit(i, { kind: e.target.value as Rule["kind"] })}><option value="PCT">Porcentaje</option><option value="FIJO">Monto fijo</option></select>
              <NumInput ariaLabel="Valor" disabled={!canEdit} value={r.value} onChange={(n) => edit(i, { value: n ?? 0 })} />
              <label className="g3-check"><input type="checkbox" disabled={!canEdit} checked={r.active} onChange={(e) => edit(i, { active: e.target.checked })} /><span>Activa</span></label>
              {canEdit && <button className="g3-linkd" onClick={() => setRules(list.filter((_, j) => j !== i))}>Quitar</button>}
            </div>))}
        </div>
        {canEdit && dirty && <div className="tn-row" style={{ marginTop: 12 }}><button className="primary-button" onClick={save} disabled={saving}>Guardar reglas</button><button className="secondary-button" onClick={() => setRules(null)}>Descartar cambios</button></div>}
      </div>

      <div className="tn-card">
        <div className="tn-card-head"><div><h2>Qué le toca a cada uno</h2><p>Resultado de las reglas por profesional y servicio. Debajo de cada valor, de dónde sale.</p></div></div>
        {matrix.length === 0 || data.services.length === 0 ? <Empty title="Cargá profesionales y servicios para ver la tabla" /> : (
          <div className="tn-table-wrap g3-scroll">
            <table className="tn-table tn-matrix">
              <thead><tr><th>Servicio</th>{matrix.map((m) => <th key={m.p.id}>{m.p.name}</th>)}</tr></thead>
              <tbody>
                {data.services.map((s, si) => (
                  <tr key={s.id}><td>{s.name}</td>{matrix.map((m) => { const c = m.cells[si]; return <td key={m.p.id}>{c ? <><strong>{c.label}</strong><small>{c.origin}</small></> : <span className="tn-muted">Sin regla</span>}</td>; })}</tr>))}
              </tbody>
            </table>
          </div>)}
      </div>
    </div>
  );
}

