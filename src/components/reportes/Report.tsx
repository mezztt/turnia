// Pieza genérica de reportes (G2): KPIs con variación, tablas, mapa de calor y descarga CSV.
import { money } from "../../config";

export interface Kpi { key: string; label: string; value: number | null; type: string; previous: number | null; delta_pct: number | null; hint: string | null }
export interface Col { key: string; label: string; type: string }
export interface Tbl { key: string; title: string; columns: Col[]; rows: Record<string, any>[] }
export interface Heat { days: string[]; hours: number[]; cells: (number | null)[][] }
export interface Rep {
  title: string; period: { from: string; to: string; days: number }; previous: { from: string; to: string }; scope: string;
  kpis: Kpi[]; tables: Tbl[]; notes: string[]; heatmap?: Heat;
}

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
export function fmt(v: unknown, type: string): string {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "money") return money(Number(v));
  if (type === "pct") return `${nf.format(Number(v))} %`;
  if (type === "int" || type === "num") return nf.format(Number(v));
  if (type === "date") return String(v).slice(0, 10).split("-").reverse().join("/");
  return String(v);
}

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="tn-kpis">
      {kpis.map((k) => (
        <div key={k.key} className="tn-kpi">
          <span>{k.label}</span>
          <strong>{fmt(k.value, k.type)}</strong>
          {k.delta_pct !== null && <span className={`g2-delta ${k.delta_pct > 0 ? "up" : k.delta_pct < 0 ? "down" : "flat"}`}>{k.delta_pct > 0 ? "▲" : k.delta_pct < 0 ? "▼" : "="} {nf.format(Math.abs(k.delta_pct))} % vs. período anterior</span>}
          {k.hint && <small style={{ color: "var(--tn-muted)" }}>{k.hint}</small>}
        </div>))}
    </div>
  );
}

export function DataTable({ t }: { t: Tbl }) {
  return (
    <div className="tn-card" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0 }}>{t.title}</h2>
      {!t.rows.length ? <small>Sin datos en el período.</small> : (
        <div className="tn-table-wrap"><table className="g2-table">
          <thead><tr>{t.columns.map((c) => <th key={c.key} style={c.type === "text" ? undefined : { textAlign: "right" }}>{c.label}</th>)}</tr></thead>
          <tbody>{t.rows.map((r, i) => <tr key={i}>{t.columns.map((c) => <td key={c.key} style={c.type === "text" ? undefined : { textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(r[c.key], c.type)}</td>)}</tr>)}</tbody>
        </table></div>)}
    </div>
  );
}

/** Mapa de calor día x hora. Texto siempre --tn-ink; el color de fondo se mezcla con la superficie hasta un 50 % para no perder contraste. */
export function Heatmap({ h }: { h: Heat }) {
  if (!h.hours.length) return null;
  const cols = h.hours.length;
  return (
    <div className="tn-card" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0 }}>Ocupación por día y hora</h2>
      <div className="g2-heat" style={{ ["--g2-cols" as string]: cols }} role="table" aria-label="Ocupación por día y hora">
        <div className="g2-heat-row" role="row"><span />{h.hours.map((x) => <span key={x} className="g2-heat-head" role="columnheader">{x}</span>)}</div>
        {h.days.map((d, i) => (
          <div key={d} className="g2-heat-row" role="row">
            <span className="g2-heat-label" role="rowheader">{d}</span>
            {h.cells[i].map((v, j) => (
              <span key={j} role="cell" className="g2-heat-cell" title={v === null ? "Sin horario" : `${nf.format(v)} %`}
                style={v === null ? undefined : { background: `color-mix(in srgb, var(--tn-brand-c) ${Math.round(Math.min(100, v) / 2)}%, var(--tn-surface))` }}>{v === null ? "" : Math.round(v)}</span>))}
          </div>))}
      </div>
      <small className="tn-hint">Porcentaje de las horas disponibles que tuvieron turno. Vacío: nadie atiende a esa hora.</small>
    </div>
  );
}
