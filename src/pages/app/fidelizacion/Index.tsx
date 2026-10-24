// Fidelización (G1): cumpleaños, clientes que no vuelven, puntos y premios, reseñas.
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getSessionUser } from "../../../config";
import { PageHeader, Tabs, useFlash } from "../../../components/ui";
import { Cumples, Inactivos, Puntos, Resenas } from "../../../components/fidelizacion/Fidelizacion";
import "../../../g1.css";

type Tab = "cumples" | "inactivos" | "puntos" | "resenas";

export default function FidelizacionPage() {
  const flash = useFlash();
  const [params, setParams] = useSearchParams();
  const front = getSessionUser()?.role !== "PROFESIONAL";
  const wanted = params.get("tab") as Tab | null;
  const tabs: [Tab, string][] = front ? [["cumples", "Cumpleaños"], ["inactivos", "Hace que no vienen"], ["puntos", "Puntos y premios"], ["resenas", "Reseñas"]] : [["resenas", "Reseñas"]];
  const tab: Tab = wanted && tabs.some(([k]) => k === wanted) ? wanted : tabs[0][0];
  const [, setN] = useState(0);
  return (
    <div data-tour="fidelizacion">
      <PageHeader eyebrow="FIDELIZACIÓN" title="Fidelización" subtitle="Saludos de cumpleaños, clientes para reactivar, puntos y reseñas." />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} options={tabs} />
      <div style={{ marginTop: 16 }}>
        {tab === "cumples" && <Cumples flash={flash} onChanged={() => setN((n) => n + 1)} />}
        {tab === "inactivos" && <Inactivos flash={flash} onChanged={() => setN((n) => n + 1)} />}
        {tab === "puntos" && <Puntos flash={flash} />}
        {tab === "resenas" && <Resenas flash={flash} onChanged={() => setN((n) => n + 1)} />}
      </div>
      {flash.node}
    </div>
  );
}
