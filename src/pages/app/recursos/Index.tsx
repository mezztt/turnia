// Recursos (G1): sillones, cabinas, camillas y equipos, con el plano del día, bloqueos y mantenimiento.
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader, Tabs, useFlash } from "../../../components/ui";
import { BlockModal, ListaRecursos, Plano, canEditResources } from "../../../components/recursos/Recursos";
import type { Res } from "../../../components/recursos/Recursos";
import "../../../g1.css";

type Tab = "plano" | "lista";

export default function RecursosPage() {
  const flash = useFlash();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "lista" ? "lista" : "plano";
  const [block, setBlock] = useState<Res | null>(null);
  const [key, setKey] = useState(0);
  const canEdit = canEditResources();
  const setTab = (t: Tab) => setParams(t === "plano" ? {} : { tab: t }, { replace: true });
  return (
    <div data-tour="recursos">
      <PageHeader eyebrow="RECURSOS" title="Recursos" subtitle="Sillones, cabinas, camillas y equipos: qué está libre, ocupado o bloqueado." />
      <Tabs value={tab} onChange={setTab} options={[["plano", "Plano del día"], ["lista", "Recursos"]]} />
      <div style={{ marginTop: 16 }}>
        {tab === "plano" ? <Plano key={key} flash={flash} canEdit={canEdit} onBlock={setBlock} /> : <ListaRecursos flash={flash} canEdit={canEdit} onBlock={setBlock} refreshKey={key} />}
      </div>
      {block && <BlockModal res={block} flash={flash} onClose={() => setBlock(null)} onSaved={() => setKey((k) => k + 1)} />}
      {flash.node}
    </div>
  );
}
