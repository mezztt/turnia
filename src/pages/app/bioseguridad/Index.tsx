// Bioseguridad y habilitaciones (G2).
import { useState } from "react";
import { PageHeader, Tabs, useFlash } from "../../../components/ui";
import VenueDocs from "../../../components/configuracion/VenueDocs";
import { Ciclos, Libro, Limpieza, Lotes, Residuos, Resumen, useSummary } from "../../../components/bioseguridad/Panels";
import "../../../g2.css";

type Tab = "resumen" | "ciclos" | "lotes" | "limpieza" | "residuos" | "venc" | "libro";

export default function BioseguridadPage() {
  const flash = useFlash();
  const [tab, setTab] = useState<Tab>("resumen");
  const [sum, refresh] = useSummary();
  return (
    <div data-tour="bioseguridad">
      <PageHeader eyebrow="BIOSEGURIDAD" title="Bioseguridad y habilitaciones" subtitle="Esterilización, lotes, limpieza, residuos y vencimientos del local." />
      <Tabs value={tab} onChange={setTab} options={[["resumen", "Resumen"], ["ciclos", "Esterilización"], ["lotes", "Lotes y material"], ["limpieza", "Limpieza"], ["residuos", "Residuos"], ["venc", "Vencimientos"], ["libro", "Libro"]]} />
      <div style={{ marginTop: 16 }}>
        {tab === "resumen" && <Resumen sum={sum} go={(t) => setTab(t as Tab)} />}
        {tab === "ciclos" && <Ciclos sum={sum} notify={flash} onChanged={refresh} />}
        {tab === "lotes" && <Lotes notify={flash} onChanged={refresh} />}
        {tab === "limpieza" && <Limpieza notify={flash} onChanged={refresh} />}
        {tab === "residuos" && <Residuos notify={flash} onChanged={refresh} />}
        {tab === "venc" && <VenueDocs show={flash.show} fail={flash.fail} />}
        {tab === "libro" && <Libro notify={flash} />}
      </div>
      {flash.node}
    </div>
  );
}
