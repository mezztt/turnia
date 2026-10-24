// Fotos antes y después (G2): recientes, portfolio y por cliente.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { appApi } from "../../../config";
import { Empty, Loading, PageHeader, Tabs, useFlash } from "../../../components/ui";
import { CustomerPicker } from "../../../components/fichas/shared";
import type { Ficha } from "../../../components/fichas/shared";
import FotosCliente from "../../../components/fotos/FotosCliente";
import { CompareModal, PhotoDetail, PhotoGrid } from "../../../components/fotos/PhotoViews";
import type { PhotoItem } from "../../../components/fotos/types";
import "../../../g2.css";

type Tab = "recientes" | "portfolio" | "cliente";

export default function FotosPage() {
  const flash = useFlash();
  const [params, setParams] = useSearchParams();
  const clienteId = Number(params.get("cliente")) || null;
  const [tab, setTab] = useState<Tab>(clienteId ? "cliente" : "recientes");
  const [rows, setRows] = useState<PhotoItem[] | null>(null);
  const [open, setOpen] = useState<PhotoItem | null>(null);
  const [cmp, setCmp] = useState<[PhotoItem, PhotoItem] | null>(null);
  const [customer, setCustomer] = useState<Ficha["customer"] | null>(null);
  const load = () => { if (tab === "cliente") return; setRows(null); appApi<PhotoItem[]>(`/photos${tab === "portfolio" ? "?public=true" : ""}`).then(setRows).catch(flash.fail); };
  useEffect(() => { load(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!clienteId) { setCustomer(null); return; }
    appApi<Ficha>(`/customers/${clienteId}/ficha`).then((f) => setCustomer(f.customer)).catch((e) => { flash.fail(e); setCustomer(null); });
  }, [clienteId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div data-tour="fotos">
      <PageHeader eyebrow="FOTOS" title="Fotos antes y después" subtitle="Cada foto se guarda con el consentimiento del cliente. Para publicarla hace falta uno específico." />
      <Tabs value={tab} onChange={setTab} options={[["recientes", "Recientes"], ["portfolio", "Portfolio"], ["cliente", "Por cliente"]]} />
      <div style={{ marginTop: 16 }}>
        {tab !== "cliente" && (!rows ? <Loading /> : !rows.length ? <Empty title={tab === "portfolio" ? "Todavía no marcaste fotos para el portfolio" : "Todavía no hay fotos"}>
          {tab === "portfolio" ? "Abrí una foto y publicala si el cliente firmó el consentimiento de portfolio." : "Subí las primeras desde la pestaña «Por cliente»."}</Empty> :
          <PhotoGrid photos={rows} showCustomer onOpen={setOpen} />)}
        {tab === "cliente" && (customer ? (
          <div>
            <button className="g2-back" onClick={() => setParams({})}>← Elegir otro cliente</button>
            <h2 style={{ marginTop: 0 }}>{customer.name}</h2>
            <FotosCliente customer={customer} notify={flash} />
          </div>) : clienteId ? <Loading /> : <CustomerPicker onPick={(c) => setParams({ cliente: String(c.id) })} />)}
      </div>
      {open && <PhotoDetail photo={open} siblings={rows || []} canPublish notify={flash} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} onCompare={(a, b) => { setOpen(null); setCmp([a, b]); }} />}
      {cmp && <CompareModal before={cmp[0]} after={cmp[1]} onClose={() => setCmp(null)} />}
      {flash.node}
    </div>
  );
}
