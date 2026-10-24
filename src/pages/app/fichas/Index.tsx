// Fichas de clientes (G2): ficha con salud, historial y consentimientos; plantillas; registro de tatuajes (Ley 7434).
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { appApi, appBlob, getSessionUser, saveBlob } from "../../../config";
import { Loading, PageHeader, Tabs, useFlash } from "../../../components/ui";
import { CustomerPicker } from "../../../components/fichas/shared";
import FichaCliente from "../../../components/fichas/FichaCliente";
import Plantillas from "../../../components/fichas/Plantillas";
import "../../../g2.css";

type Tab = "ficha" | "plantillas" | "registro";
interface RegisterJob { registro: number; fecha: string | null; cliente: string | null; profesional: string | null; consentimiento_n: number | null; materiales: { material: string; lote: string | null }[] }
interface Register { trabajos: RegisterJob[]; clientes: unknown[]; consentimientos: unknown[] }

export default function FichasPage() {
  const flash = useFlash();
  const user = getSessionUser();
  const [params, setParams] = useSearchParams();
  const clienteId = Number(params.get("cliente")) || null;
  const [tab, setTab] = useState<Tab>("ficha");
  const canTpl = user?.role === "ADMINISTRADOR" || user?.role === "ENCARGADO";
  const canReg = !!user?.tattoo_mode && user?.role === "ADMINISTRADOR";
  const tabs: [Tab, string][] = [["ficha", "Ficha"]];
  if (canTpl) tabs.push(["plantillas", "Plantillas"]);
  if (canReg) tabs.push(["registro", "Registro de tatuajes"]);

  return (
    <div data-tour="fichas">
      <PageHeader eyebrow="FICHAS" title="Fichas de clientes" subtitle="Salud, fórmulas, historial y consentimientos de cada cliente." />
      {tabs.length > 1 && <Tabs value={tab} onChange={setTab} options={tabs} />}
      <div style={{ marginTop: 16 }}>
        {tab === "ficha" && (clienteId ? (
          <div>
            <button className="g2-back" onClick={() => setParams({})}>← Elegir otro cliente</button>
            <FichaCliente customerId={clienteId} notify={flash} />
          </div>) : <CustomerPicker onPick={(c) => setParams({ cliente: String(c.id) })} />)}
        {tab === "plantillas" && <Plantillas notify={flash} />}
        {tab === "registro" && <Registro notify={flash} />}
      </div>
      {flash.node}
    </div>
  );
}

function Registro({ notify }: { notify: { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void } }) {
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Register | null>(null);
  async function show() {
    setBusy(true);
    try { setData(await appApi<Register>("/tattoo/register/export")); } catch (e) { notify.fail(e); } finally { setBusy(false); }
  }
  async function csv() {
    try { saveBlob(await appBlob("/tattoo/register/export?format=csv"), "registro-de-trabajos.csv"); } catch (e) { notify.fail(e); }
  }
  return (
    <div className="tn-card">
      <div className="g2-head"><div><h2>Registro de trabajos</h2><small>Art. 11 de la Ley 7434: nombre, domicilio, teléfono, edad y fecha de nacimiento de cada cliente, con el consentimiento numerado. Se conserva 5 años.</small></div>
        <div className="g2-row-actions"><button className="secondary-button" onClick={show} disabled={busy}>Ver el registro</button><button className="primary-button" onClick={csv}>Descargar CSV</button></div></div>
      {busy && <Loading />}
      {data && (data.trabajos.length === 0 ? <p className="tn-hint">Todavía no hay trabajos registrados.</p> : (
        <div>
          <p className="tn-hint">{data.trabajos.length} trabajos · {data.clientes.length} clientes · {data.consentimientos.length} consentimientos.</p>
          <div className="tn-table-wrap"><table className="g2-table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Consentimiento N.º</th><th>Profesional</th><th>Materiales y lotes</th></tr></thead>
            <tbody>{data.trabajos.map((r) => <tr key={r.registro}><td>{r.fecha ? r.fecha.slice(0, 10) : "—"}</td><td>{r.cliente || "—"}</td><td>{r.consentimiento_n ?? "—"}</td><td>{r.profesional || "—"}</td>
              <td>{r.materiales.map((m) => `${m.material} (lote ${m.lote || "—"})`).join(", ") || "—"}</td></tr>)}</tbody></table></div>
        </div>))}
    </div>
  );
}
