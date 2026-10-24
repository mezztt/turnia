// Reportes (G2): ocupación, ingresos, retención, ausencias, productos y comisiones.
import { useEffect, useState } from "react";
import { appApi, appBlob, getSessionUser, saveBlob } from "../../../config";
import { Loading, PageHeader, Tabs, useFlash } from "../../../components/ui";
import { DataTable, Heatmap, KpiGrid } from "../../../components/reportes/Report";
import type { Rep } from "../../../components/reportes/Report";
import "../../../g2.css";

type Kind = "occupancy" | "income" | "retention" | "noshows" | "products" | "commissions";
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function preset(p: string): [string, string] {
  const now = new Date();
  if (p === "mes") return [day(new Date(now.getFullYear(), now.getMonth(), 1)), day(now)];
  if (p === "anterior") return [day(new Date(now.getFullYear(), now.getMonth() - 1, 1)), day(new Date(now.getFullYear(), now.getMonth(), 0))];
  if (p === "30") return [day(new Date(now.getTime() - 29 * 86400000)), day(now)];
  return [day(new Date(now.getFullYear(), 0, 1)), day(now)];
}

export default function ReportesPage() {
  const flash = useFlash();
  const user = getSessionUser();
  const mine = user?.role === "PROFESIONAL";
  const [kind, setKind] = useState<Kind>("occupancy");
  const [range, setRange] = useState<[string, string]>(preset("mes"));
  const [pro, setPro] = useState("");
  const [pros, setPros] = useState<{ id: number; name: string; display_name?: string | null }[]>([]);
  const [rep, setRep] = useState<Rep | null>(null);
  const [error, setError] = useState("");
  const tabs: [Kind, string][] = [["occupancy", "Ocupación"], ["income", "Ingresos"], ["retention", "Clientes"], ["noshows", "Ausencias"]];
  if (!mine) tabs.push(["products", "Productos"]);
  tabs.push(["commissions", "Comisiones"]);

  useEffect(() => { if (!mine) appApi<typeof pros>("/professionals").then(setPros).catch(() => setPros([])); }, [mine]);
  const query = () => `date_from=${range[0]}&date_to=${range[1]}${pro && kind !== "products" ? `&professional_id=${pro}` : ""}`;
  useEffect(() => {
    setRep(null); setError("");
    if (range[0] > range[1]) { setError("La fecha «desde» es posterior a «hasta»."); return; }
    appApi<Rep>(`/reports/${kind}?${query()}`).then(setRep).catch((e) => setError(e instanceof Error ? e.message : "No se pudo armar el reporte"));
  }, [kind, range, pro]); // eslint-disable-line react-hooks/exhaustive-deps

  async function csv() {
    try { saveBlob(await appBlob(`/reports/${kind}?${query()}&format=csv`), `reporte-${kind}-${range[0]}_${range[1]}.csv`); } catch (e) { flash.fail(e); }
  }
  return (
    <div data-tour="reportes">
      <PageHeader eyebrow="REPORTES" title="Reportes" subtitle="Cómo viene el local, comparado con el período anterior." />
      <Tabs value={kind} onChange={setKind} options={tabs} />
      <div className="g2-period" style={{ marginTop: 16 }}>
        <div className="form-group"><label htmlFor="rp">Período</label>
          <select id="rp" defaultValue="mes" onChange={(e) => setRange(preset(e.target.value))}><option value="mes">Este mes</option><option value="anterior">Mes anterior</option><option value="30">Últimos 30 días</option><option value="anio">Este año</option></select></div>
        <div className="form-group"><label htmlFor="rd">Desde</label><input id="rd" type="date" value={range[0]} onChange={(e) => setRange([e.target.value, range[1]])} /></div>
        <div className="form-group"><label htmlFor="rh">Hasta</label><input id="rh" type="date" value={range[1]} onChange={(e) => setRange([range[0], e.target.value])} /></div>
        {!mine && kind !== "products" && <div className="form-group"><label htmlFor="rf">Profesional</label>
          <select id="rf" value={pro} onChange={(e) => setPro(e.target.value)}><option value="">Todos</option>{pros.map((p) => <option key={p.id} value={p.id}>{p.display_name || p.name}</option>)}</select></div>}
        <button className="secondary-button" onClick={csv} disabled={!rep}>Descargar CSV</button>
      </div>
      {error && <div className="tn-note tn-note-error" role="alert">{error}</div>}
      {!rep && !error && <Loading />}
      {rep && (
        <div>
          <p className="g2-scope">{rep.scope} · del {rep.period.from.split("-").reverse().join("/")} al {rep.period.to.split("-").reverse().join("/")} ({rep.period.days} días)</p>
          <KpiGrid kpis={rep.kpis} />
          {rep.heatmap && <Heatmap h={rep.heatmap} />}
          {rep.tables.map((t) => <DataTable key={t.key} t={t} />)}
          {rep.notes.map((n, i) => <p key={i} className="tn-hint">{n}</p>)}
        </div>)}
      {flash.node}
    </div>
  );
}
