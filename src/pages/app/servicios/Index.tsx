// Servicios y equipo (núcleo, G1): catálogo con fases, equipo con horarios y ausencias, feriados y sugeridos del rubro.
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getSessionUser, vocab, cap } from "../../../config";
import { PageHeader, Tabs, useFlash } from "../../../components/ui";
import { Equipo, Feriados, RecursosHint, Servicios, Sugeridos } from "../../../components/servicios/Servicios";
import "../../../g1.css";

type Tab = "servicios" | "equipo" | "feriados" | "sugeridos";

export default function ServiciosPage() {
  const flash = useFlash();
  const v = vocab(getSessionUser());
  const [params, setParams] = useSearchParams();
  const edit = ["ADMINISTRADOR", "ENCARGADO"].includes(getSessionUser()?.role || "");
  const tabs: [Tab, string][] = [["servicios", "Servicios"], ["equipo", cap(v.profesionales)], ["feriados", "Días cerrados"], ...(edit ? [["sugeridos", "Sugeridos del rubro"]] as [Tab, string][] : [])];
  const wanted = params.get("tab") as Tab | null;
  const tab: Tab = wanted && tabs.some(([k]) => k === wanted) ? wanted : "servicios";
  const [key, setKey] = useState(0);
  return (
    <div data-tour="servicios">
      <PageHeader eyebrow="SERVICIOS" title="Servicios y equipo" subtitle={`Qué se ofrece, cuánto dura, quién lo hace y cuándo atiende cada ${v.profesional}.`} />
      <Tabs value={tab} onChange={(t) => setParams(t === "servicios" ? {} : { tab: t }, { replace: true })} options={tabs} />
      <div style={{ marginTop: 16 }}>
        {tab === "servicios" && <Servicios key={key} flash={flash} />}
        {tab === "equipo" && <Equipo flash={flash} />}
        {tab === "feriados" && <Feriados flash={flash} />}
        {tab === "sugeridos" && <Sugeridos flash={flash} onApplied={() => { setKey((k) => k + 1); setParams({}, { replace: true }); }} />}
        <RecursosHint />
      </div>
      {flash.node}
    </div>
  );
}
