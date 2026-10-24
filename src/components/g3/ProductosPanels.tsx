// Piezas de Productos y stock: alta y edición, movimientos, inventario, consumo por servicio y proveedores.
import { useMemo, useState } from "react";
import { appApi, money } from "../../config";
import { Empty, Field, Modal, Pill, Seg, Switch } from "../ui";
import { fmtNum, fmtQty } from "../r1/common";
import { printCountSheet } from "../../pages/print/g3print";
import { ErrorNote, NumInput, dmyhm, errMsg, signed, useLoad } from "./common";

export interface Prod {
  id: number; name: string; brand: string | null; sku: string | null; kind: "VENTA" | "INSUMO"; unit: string; price: number; cost?: number; margin_pct?: number | null;
  stock_qty: number; min_qty: number; track_stock: boolean; supplier_id: number | null; active: boolean; expires_tracking: boolean; low: boolean;
}
export interface Supplier { id: number; name: string; phone: string | null; contact: string | null; notes: string | null }
const UNITS: [string, string][] = [["u", "unidades"], ["g", "gramos"], ["ml", "mililitros"], ["kg", "kilos"], ["l", "litros"]];

export function ProductForm({ product, suppliers, onClose, onSaved }: { product: Prod | null; suppliers: Supplier[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: product?.name || "", brand: product?.brand || "", sku: product?.sku || "", kind: (product?.kind || "VENTA") as "VENTA" | "INSUMO", unit: product?.unit || "u",
    price: product?.price ?? 0, cost: product?.cost ?? 0, min_qty: product?.min_qty ?? 0, track_stock: product?.track_stock ?? true,
    supplier_id: product?.supplier_id ? String(product.supplier_id) : "", active: product?.active ?? true, initial_qty: null as number | null,
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, val: (typeof f)[K]) => setF((x) => ({ ...x, [k]: val }));
  async function save() {
    setBusy(true);
    try {
      const body = { ...f, brand: f.brand.trim() || null, sku: f.sku.trim() || null, supplier_id: f.supplier_id ? Number(f.supplier_id) : null, price: f.price || 0, cost: f.cost || 0,
        min_qty: f.min_qty || 0, initial_qty: product ? null : f.initial_qty };
      await appApi(product ? `/products/${product.id}` : "/products", { method: product ? "PUT" : "POST", body });
      onSaved();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="PRODUCTOS" title={product ? "Editar producto" : "Nuevo producto"} size="wide" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="primary-button" onClick={save} disabled={busy || f.name.trim().length < 2}>Guardar</button></>}>
      <ErrorNote text={err} />
      <div className="tn-grid-form">
        <Field label="Qué es" wide><Seg value={f.kind} options={[["VENTA", "Producto de venta"], ["INSUMO", "Insumo de uso"]]} onChange={(k) => set("kind", k)} /></Field>
        <Field label="Nombre"><input value={f.name} maxLength={150} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
        <Field label="Marca"><input value={f.brand} maxLength={80} onChange={(e) => set("brand", e.target.value)} /></Field>
        <Field label="Código (opcional)"><input value={f.sku} maxLength={40} onChange={(e) => set("sku", e.target.value)} /></Field>
        <Field label="Unidad de medida"><select value={f.unit} onChange={(e) => set("unit", e.target.value)}>{UNITS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        {f.kind === "VENTA" && <Field label="Precio de venta"><NumInput value={f.price} onChange={(n) => set("price", n ?? 0)} ariaLabel="Precio de venta" /></Field>}
        <Field label={`Costo por ${f.unit}`} hint="Para calcular el margen y las comisiones sobre neto de insumos."><NumInput value={f.cost} onChange={(n) => set("cost", n ?? 0)} ariaLabel="Costo" /></Field>
        <Field label="Stock mínimo" hint="Te avisamos cuando baja de este número."><NumInput value={f.min_qty} onChange={(n) => set("min_qty", n ?? 0)} ariaLabel="Stock mínimo" /></Field>
        {!product && <Field label="Stock inicial"><NumInput value={f.initial_qty} onChange={(n) => set("initial_qty", n)} ariaLabel="Stock inicial" /></Field>}
        <Field label="Proveedor"><select value={f.supplier_id} onChange={(e) => set("supplier_id", e.target.value)}><option value="">Sin proveedor</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <div style={{ gridColumn: "1 / -1" }} className="tn-stack">
          <Switch on={f.track_stock} onChange={(b) => set("track_stock", b)} label="Llevar el stock" hint="Si lo apagás, se vende o se usa sin descontar nada." />
          {product && <Switch on={f.active} onChange={(b) => set("active", b)} label="Activo" hint="Los productos dados de baja no aparecen en la caja." />}
        </div>
      </div>
    </Modal>
  );
}

export function MovementForm({ product, initial, onClose, onSaved }: { product: Prod; initial: "ENTRADA" | "MERMA" | "AJUSTE"; onClose: () => void; onSaved: (warning?: string | null) => void }) {
  const [kind, setKind] = useState<"ENTRADA" | "MERMA" | "AJUSTE">(initial);
  const [qty, setQty] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const r = await appApi<{ warning: string | null }>("/stock/movements", { method: "POST", body: { product_id: product.id, kind, qty, unit_cost: kind === "ENTRADA" ? cost : null, reason: reason.trim() || null } });
      onSaved(r.warning);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow={product.name.toUpperCase()} title="Mover stock" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="primary-button" onClick={save} disabled={busy || !qty || (kind !== "ENTRADA" && reason.trim().length < 2)}>Guardar</button></>}>
      <p className="tn-muted">En stock ahora: <strong>{fmtQty(product.stock_qty, product.unit)}</strong></p>
      <ErrorNote text={err} />
      <div className="tn-grid-form">
        <Field label="Qué pasó" wide><Seg value={kind} options={[["ENTRADA", "Entró mercadería"], ["MERMA", "Merma o pérdida"], ["AJUSTE", "Ajuste (+/−)"]]} onChange={setKind} /></Field>
        <Field label={kind === "AJUSTE" ? `Cantidad con signo (en ${product.unit})` : `Cantidad (en ${product.unit})`} hint={kind === "AJUSTE" ? "Positivo suma, negativo resta." : undefined}><NumInput value={qty} onChange={setQty} ariaLabel="Cantidad" autoFocus /></Field>
        {kind === "ENTRADA" && <Field label={`Costo por ${product.unit} (opcional)`} hint="Actualiza el costo del producto."><NumInput value={cost} onChange={setCost} ariaLabel="Costo" /></Field>}
        <Field label={kind === "ENTRADA" ? "Nota (opcional)" : "Motivo"} wide><input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={kind === "MERMA" ? "Ej.: se venció, se derramó" : ""} /></Field>
      </div>
    </Modal>
  );
}

interface Mv { id: number; kind: string; qty: number; unit_cost: number | null; reason: string | null; created_at: string; ref_type: string | null }
const KIND_LABEL: Record<string, string> = { ENTRADA: "Entrada", VENTA: "Venta", CONSUMO: "Consumo", MERMA: "Merma", AJUSTE: "Ajuste", INVENTARIO: "Conteo" };
export function MovesModal({ product, onClose }: { product: Prod; onClose: () => void }) {
  const { data, error } = useLoad<Mv[]>(`/products/${product.id}/movements`);
  return (
    <Modal eyebrow={product.name.toUpperCase()} title="Movimientos de stock" onClose={onClose} footer={<button className="primary-button" onClick={onClose}>Cerrar</button>}>
      <ErrorNote text={error} />
      {data && data.length === 0 && <Empty title="Sin movimientos" />}
      {data && data.length > 0 && (
        <div className="tn-table-wrap g3-scroll">
          <table className="tn-table">
            <thead><tr><th>Fecha</th><th>Tipo</th><th className="num">Cantidad</th><th>Detalle</th></tr></thead>
            <tbody>{data.map((m) => <tr key={m.id}><td>{dmyhm(m.created_at)}</td><td>{KIND_LABEL[m.kind] || m.kind}</td><td className="num">{signed(m.qty)} {product.unit}</td><td>{m.reason || "—"}</td></tr>)}</tbody>
          </table>
        </div>)}
    </Modal>
  );
}

// ----------------------------------------------------------------------------------------------------------------
interface Cons { service_id: number; name: string; items: { product_id: number; name: string; unit: string; qty: number }[] }
export function ConsumptionTab({ products, version, onSaved }: { products: Prod[]; version: number; onSaved: () => void }) {
  const { data, error, reload } = useLoad<Cons[]>(`/consumptions?v=${version}`);
  const [edit, setEdit] = useState<Cons | null>(null);
  const supplies = products.filter((p) => p.kind === "INSUMO" && p.active);
  return (
    <div className="tn-stack">
      <p className="tn-muted">Cargá qué insumos gasta cada servicio. Al cobrar el turno, el stock se descuenta solo (puede quedar en negativo con aviso).</p>
      {supplies.length === 0 && <div className="tn-note tn-note-info">Primero cargá tus insumos (tintas, oxidante, agujas...) como «Insumo de uso» en la pestaña Productos.</div>}
      <ErrorNote text={error} />
      {data && (
        <div className="tn-table-wrap">
          <table className="tn-table">
            <thead><tr><th>Servicio</th><th>Gasta</th><th /></tr></thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.service_id}>
                  <td><strong>{s.name}</strong></td>
                  <td>{s.items.length === 0 ? <span className="tn-muted">Sin insumos cargados</span> : s.items.map((i) => `${i.name} (${fmtNum(i.qty, 3)} ${i.unit})`).join(" · ")}</td>
                  <td><button className="secondary-button g3-small" disabled={supplies.length === 0} onClick={() => setEdit(s)}>Editar</button></td>
                </tr>))}
            </tbody>
          </table>
        </div>)}
      {edit && <ConsumptionEditor svc={edit} supplies={supplies} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void reload(); onSaved(); }} />}
    </div>
  );
}
function ConsumptionEditor({ svc, supplies, onClose, onSaved }: { svc: Cons; supplies: Prod[]; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<{ product_id: number | null; qty: number | null }[]>(svc.items.length ? svc.items.map((i) => ({ product_id: i.product_id, qty: i.qty })) : [{ product_id: null, qty: null }]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const items = rows.filter((r) => r.product_id && r.qty && r.qty > 0).map((r) => ({ product_id: r.product_id, qty: r.qty }));
      await appApi(`/services/${svc.service_id}/consumptions`, { method: "PUT", body: { items } });
      onSaved();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="CONSUMO POR SERVICIO" title={svc.name} onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="primary-button" onClick={save} disabled={busy}>Guardar</button></>}>
      <ErrorNote text={err} />
      <div className="tn-rows">
        {rows.map((r, i) => {
          const p = supplies.find((x) => x.id === r.product_id);
          return (
            <div className="g3-cons-row" key={i}>
              <select aria-label="Insumo" value={r.product_id ?? ""} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, product_id: e.target.value ? Number(e.target.value) : null } : x)))}>
                <option value="">Elegí un insumo</option>{supplies.map((s) => <option key={s.id} value={s.id}>{s.name}{s.brand ? ` · ${s.brand}` : ""}</option>)}
              </select>
              <NumInput ariaLabel="Cantidad" value={r.qty} onChange={(n) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, qty: n } : x)))} />
              <span className="tn-muted">{p?.unit || ""}</span>
              <button className="g3-linkd" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Quitar insumo">Quitar</button>
            </div>)
        })}
      </div>
      <button className="tn-link-button" onClick={() => setRows((rs) => [...rs, { product_id: null, qty: null }])}>+ Otro insumo</button>
    </Modal>
  );
}

// ----------------------------------------------------------------------------------------------------------------
export function InventoryTab({ products, local, onSaved }: { products: Prod[]; local: string; onSaved: () => void }) {
  const tracked = useMemo(() => products.filter((p) => p.active && p.track_stock), [products]);
  const [counts, setCounts] = useState<Record<number, number | null>>({});
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ counted: number; changed: number; changes: { product_id: number; name: string; unit: string; before: number; counted: number; diff: number; value: number }[] } | null>(null);
  const filled = Object.entries(counts).filter(([, v]) => v !== null && v !== undefined);
  async function save() {
    setBusy(true); setErr("");
    try {
      const r = await appApi<NonNullable<typeof result>>("/stock/inventory", { method: "POST", body: { counts: filled.map(([id, v]) => ({ product_id: Number(id), counted_qty: v })), reason: reason.trim() || null } });
      setResult(r); setCounts({}); onSaved();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  if (result) {
    return (
      <div className="tn-stack">
        <div className="tn-note tn-note-info">Conteo guardado: {result.counted} productos contados, {result.changed} con diferencia.</div>
        {result.changes.length > 0 && (
          <div className="tn-table-wrap"><table className="tn-table">
            <thead><tr><th>Producto</th><th className="num">Sistema</th><th className="num">Contado</th><th className="num">Diferencia</th><th className="num">Valor</th></tr></thead>
            <tbody>{result.changes.map((c) => <tr key={c.product_id}><td>{c.name}</td><td className="num">{fmtNum(c.before, 3)} {c.unit}</td><td className="num">{fmtNum(c.counted, 3)} {c.unit}</td>
              <td className="num"><Pill tone={c.diff < 0 ? "red" : "orange"}>{signed(c.diff)} {c.unit}</Pill></td><td className="num">{money(c.value)}</td></tr>)}</tbody></table></div>)}
        <div><button className="primary-button" onClick={() => setResult(null)}>Hacer otro conteo</button></div>
      </div>);
  }
  return (
    <div className="tn-stack">
      <div className="tn-spread">
        <p className="tn-muted" style={{ margin: 0 }}>Contá lo que hay en el estante y cargalo. Solo se ajustan los productos donde pongas un número.</p>
        <button className="secondary-button" onClick={() => printCountSheet(local, tracked)}>Imprimir planilla de conteo</button>
      </div>
      <ErrorNote text={err} />
      {tracked.length === 0 ? <Empty title="No hay productos con stock para contar" /> : (
        <div className="tn-table-wrap">
          <table className="tn-table">
            <thead><tr><th>Producto</th><th className="num">En sistema</th><th>Contado</th><th className="num">Diferencia</th></tr></thead>
            <tbody>
              {tracked.map((p) => {
                const c = counts[p.id];
                const diff = c === null || c === undefined ? null : Math.round((c - p.stock_qty) * 1000) / 1000;
                return (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong>{p.brand && <small>{p.brand}</small>}</td>
                    <td className="num">{fmtQty(p.stock_qty, p.unit)}</td>
                    <td><NumInput ariaLabel={`Contado de ${p.name}`} className="g3-narrow" value={c ?? null} onChange={(n) => setCounts((x) => ({ ...x, [p.id]: n }))} /> <span className="tn-muted">{p.unit}</span></td>
                    <td className="num">{diff === null ? "—" : diff === 0 ? "Coincide" : <Pill tone={diff < 0 ? "red" : "orange"}>{signed(diff)}</Pill>}</td>
                  </tr>);
              })}
            </tbody>
          </table>
        </div>)}
      <div className="tn-grid-form">
        <Field label="Nota del conteo (opcional)"><input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: conteo de fin de mes" /></Field>
      </div>
      <div><button className="primary-button" onClick={save} disabled={busy || filled.length === 0}>Guardar conteo ({filled.length})</button></div>
    </div>
  );
}

// ----------------------------------------------------------------------------------------------------------------
export function SuppliersTab({ onChanged }: { onChanged: () => void }) {
  const { data, error, reload } = useLoad<Supplier[]>("/suppliers");
  const [edit, setEdit] = useState<Supplier | "new" | null>(null);
  return (
    <div className="tn-stack">
      <div className="tn-spread"><p className="tn-muted" style={{ margin: 0 }}>A quién le comprás. Se asocia a cada producto para saber dónde reponer.</p><button className="primary-button" onClick={() => setEdit("new")}>Nuevo proveedor</button></div>
      <ErrorNote text={error} />
      {data && data.length === 0 && <Empty title="Todavía no cargaste proveedores">Es opcional: sirve para saber a quién pedirle cuando algo baja del mínimo.</Empty>}
      {data && data.length > 0 && (
        <ul className="tn-list">
          {data.map((s) => (
            <li key={s.id}><div className="tn-list-main"><strong>{s.name}</strong><small>{[s.contact, s.phone, s.notes].filter(Boolean).join(" · ") || "Sin datos de contacto"}</small></div>
              <button className="secondary-button g3-small" onClick={() => setEdit(s)}>Editar</button></li>))}
        </ul>)}
      {edit && <SupplierForm s={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void reload(); onChanged(); }} />}
    </div>
  );
}
function SupplierForm({ s, onClose, onSaved }: { s: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: s?.name || "", phone: s?.phone || "", contact: s?.contact || "", notes: s?.notes || "" });
  const [err, setErr] = useState("");
  async function save() {
    try { await appApi(s ? `/suppliers/${s.id}` : "/suppliers", { method: s ? "PUT" : "POST", body: { name: f.name, phone: f.phone || null, contact: f.contact || null, notes: f.notes || null } }); onSaved(); } catch (e) { setErr(errMsg(e)); }
  }
  return (
    <Modal eyebrow="PROVEEDORES" title={s ? "Editar proveedor" : "Nuevo proveedor"} onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="primary-button" disabled={f.name.trim().length < 2} onClick={save}>Guardar</button></>}>
      <ErrorNote text={err} />
      <div className="tn-grid-form">
        <Field label="Nombre"><input value={f.name} maxLength={150} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Contacto"><input value={f.contact} maxLength={120} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
        <Field label="Teléfono"><input value={f.phone} maxLength={40} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Notas"><input value={f.notes} maxLength={300} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
