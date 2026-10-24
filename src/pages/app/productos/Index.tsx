// Productos y stock (G3): productos de venta e insumos, mínimos, movimientos, conteo físico y consumo por servicio.
import { useState } from "react";
import { getSessionUser, money } from "../../../config";
import { Empty, Loading, PageHeader, Pill, Tabs, useFlash } from "../../../components/ui";
import { Kpi, ErrorNote, useLoad } from "../../../components/g3/common";
import { EmptyAction, fmtQty } from "../../../components/r1/common";
import { ConsumptionTab, InventoryTab, MovementForm, MovesModal, ProductForm, SuppliersTab } from "../../../components/g3/ProductosPanels";
import type { Prod, Supplier } from "../../../components/g3/ProductosPanels";

type Tab = "productos" | "consumo" | "inventario" | "proveedores";
export default function ProductosPage() {
  const user = getSessionUser();
  const flash = useFlash();
  const isBoss = user?.role === "ADMINISTRADOR" || user?.role === "ENCARGADO";
  const [tab, setTab] = useState<Tab>("productos");
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((n) => n + 1);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [showOff, setShowOff] = useState(false);
  const all = useLoad<Prod[]>(`/products?v=${version}`);
  const suppliers = useLoad<Supplier[]>(`/suppliers?v=${version}`);
  const summary = useLoad<{ count: number; low: number; stock_value: number }>(isBoss ? `/products/summary?v=${version}` : null);
  const [form, setForm] = useState<Prod | "new" | null>(null);
  const [move, setMove] = useState<{ p: Prod; kind: "ENTRADA" | "MERMA" | "AJUSTE" } | null>(null);
  const [moves, setMoves] = useState<Prod | null>(null);
  const supName = (id: number | null) => suppliers.data?.find((s) => s.id === id)?.name;

  const rows = (all.data || []).filter((p) => (showOff || p.active) && (!kind || p.kind === kind) && (!onlyLow || p.low)
    && (!q.trim() || (p.name + " " + (p.brand || "") + " " + (p.sku || "")).toLowerCase().includes(q.trim().toLowerCase())));
  const tabs: [Tab, string][] = [["productos", "Productos"]];
  if (isBoss) tabs.push(["consumo", "Insumos por servicio"], ["inventario", "Conteo de stock"], ["proveedores", "Proveedores"]);

  return (
    <div data-tour="productos">
      <PageHeader eyebrow="STOCK" title="Productos y stock" subtitle="Lo que vendés, lo que gastás en cada servicio y cuándo reponer.">
        {isBoss && tab === "productos" && <button className="primary-button" onClick={() => setForm("new")}>Nuevo producto</button>}
      </PageHeader>
      {tabs.length > 1 && <Tabs value={tab} onChange={setTab} options={tabs} />}
      <ErrorNote text={all.error} />
      {tab === "productos" && (
        <div className="tn-stack">
          {summary.data && (
            <div className="tn-kpis">
              <Kpi label="Productos activos" value={summary.data.count} />
              <Kpi label="Bajo el mínimo" value={summary.data.low} tone={summary.data.low ? "warn" : undefined} onClick={() => setOnlyLow(!onlyLow)} hint={onlyLow ? "Mostrando solo esos" : "Tocá para filtrar"} />
              <Kpi label="Stock valorizado a costo" value={money(summary.data.stock_value)} />
            </div>)}
          <div className="tn-filters">
            <input className="tn-search" placeholder="Buscar por nombre, marca o código" aria-label="Buscar producto" value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Venta e insumos</option><option value="VENTA">Solo de venta</option><option value="INSUMO">Solo insumos</option></select>
            <label><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Bajo el mínimo</label>
            <label><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Ver dados de baja</label>
          </div>
          {all.loading && !all.data && <Loading />}
          {all.data && all.data.length === 0 && (
            <EmptyAction title="Todavía no cargaste productos" text="Cargá lo que vendés (shampoo, tintas, cremas) y los insumos que gastás en los servicios."
              action={isBoss ? "Cargar el primero" : undefined} onAction={() => setForm("new")} />)}
          {all.data && all.data.length > 0 && rows.length === 0 && <Empty title="No hay productos con ese filtro" />}
          {rows.length > 0 && (
            <div className="tn-table-wrap">
              <table className="tn-table">
                <thead><tr><th>Producto</th><th>Tipo</th><th className="num">Stock</th><th className="num">Mínimo</th><th className="num">Precio</th>{isBoss && <th className="num">Costo</th>}{isBoss && <th className="num">Margen</th>}<th /></tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className={!p.active ? "g3-off" : ""}>
                      <td><strong>{p.name}</strong><small>{[p.brand, p.sku, supName(p.supplier_id)].filter(Boolean).join(" · ")}</small>{!p.active && <Pill tone="gray">Dado de baja</Pill>}</td>
                      <td>{p.kind === "VENTA" ? "Venta" : "Insumo"}</td>
                      <td className="num">{p.track_stock ? <>{fmtQty(p.stock_qty, p.unit)} {p.low && <Pill tone={p.stock_qty <= 0 ? "red" : "orange"}>{p.stock_qty < 0 ? "Negativo" : "Bajo"}</Pill>}</> : <span className="tn-muted">No se controla</span>}</td>
                      <td className="num">{p.track_stock && p.min_qty > 0 ? fmtQty(p.min_qty, p.unit) : "—"}</td>
                      <td className="num">{p.kind === "VENTA" ? money(p.price) : "—"}</td>
                      {isBoss && <td className="num">{money(p.cost)}</td>}
                      {isBoss && <td className="num">{p.margin_pct === null || p.margin_pct === undefined ? "—" : `${p.margin_pct}%`}</td>}
                      <td>
                        <div className="g3-actions">
                          <button className="secondary-button g3-small" onClick={() => setMoves(p)}>Historial</button>
                          {isBoss && p.track_stock && <button className="secondary-button g3-small" onClick={() => setMove({ p, kind: "ENTRADA" })}>Entrada</button>}
                          {isBoss && p.track_stock && <button className="secondary-button g3-small" onClick={() => setMove({ p, kind: "AJUSTE" })}>Ajustar</button>}
                          {isBoss && <button className="secondary-button g3-small" onClick={() => setForm(p)}>Editar</button>}
                        </div>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>)}
        </div>)}
      {tab === "consumo" && isBoss && <ConsumptionTab products={all.data || []} version={version} onSaved={() => flash.show("Consumo guardado")} />}
      {tab === "inventario" && isBoss && <InventoryTab products={all.data || []} local={user?.company_name || ""} onSaved={bump} />}
      {tab === "proveedores" && isBoss && <SuppliersTab onChanged={bump} />}
      {form && <ProductForm product={form === "new" ? null : form} suppliers={suppliers.data || []} onClose={() => setForm(null)} onSaved={() => { setForm(null); bump(); flash.show("Producto guardado"); }} />}
      {move && <MovementForm product={move.p} initial={move.kind} onClose={() => setMove(null)} onSaved={(w) => { setMove(null); bump(); flash.show(w || "Stock actualizado"); }} />}
      {moves && <MovesModal product={moves} onClose={() => setMoves(null)} />}
      {flash.node}
    </div>
  );
}
