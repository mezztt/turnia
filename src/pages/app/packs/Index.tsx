// Packs y membresías (G3): saldos de sesiones, membresías con su próximo cobro y catálogo.
import { useState } from "react";
import { appApi, getSessionUser, money } from "../../../config";
import { Empty, Loading, PageHeader, Pill, Tabs, useFlash } from "../../../components/ui";
import { ErrorNote, Kpi, WaButton, dmy, useLoad } from "../../../components/g3/common";
import {
  CancelMembershipModal, CatalogTab, PACK_LABEL, PACK_TONE, PackDetailModal, RenewModal, SellMembershipModal, SellPackModal, memMsg, packMsg,
} from "../../../components/g3/PacksPanels";
import type { MemRow, PackRow, Plan, Tpl } from "../../../components/g3/PacksPanels";

type Tab = "saldos" | "membresias" | "catalogo";
export default function PacksPage() {
  const user = getSessionUser();
  const flash = useFlash();
  const local = user?.company_name || "el local";
  const canSell = user?.role !== "PROFESIONAL";
  const canEdit = user?.role === "ADMINISTRADOR" || user?.role === "ENCARGADO";
  const [tab, setTab] = useState<Tab>("saldos");
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((n) => n + 1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ACTIVO");
  const [mstatus, setMstatus] = useState("");
  const packs = useLoad<PackRow[]>(`/client-packs?v=${version}${status ? `&status=${status}` : ""}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`);
  const mems = useLoad<MemRow[]>(`/memberships?v=${version}${mstatus ? `&status=${mstatus}` : ""}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`);
  const exp = useLoad<{ memberships: MemRow[]; packs: PackRow[] }>(canSell ? `/memberships/expiring?v=${version}` : null);
  const tpls = useLoad<Tpl[]>(canSell ? `/pack-templates?v=${version}` : null);
  const plans = useLoad<Plan[]>(canSell ? `/membership-plans?v=${version}` : null);
  const [sellPack, setSellPack] = useState(false);
  const [sellMem, setSellMem] = useState(false);
  const [detail, setDetail] = useState<number | null>(null);
  const [renew, setRenew] = useState<MemRow | null>(null);
  const [cancel, setCancel] = useState<MemRow | null>(null);
  const done = (msg: string) => { setSellPack(false); setSellMem(false); setRenew(null); setCancel(null); bump(); flash.show(msg); };

  async function pause(m: MemRow, resume: boolean) {
    try { await appApi(`/memberships/${m.id}/pause`, { method: "POST", body: { resume } }); bump(); flash.show(resume ? "Membresía reanudada" : "Membresía en pausa"); } catch (e) { flash.fail(e); }
  }
  async function copyLink(token?: string) {
    if (!token) return;
    const url = `${window.location.origin}/mi-pack/${token}`;
    try { await navigator.clipboard.writeText(url); flash.show("Link copiado: el cliente ve su saldo sin entrar al sistema"); } catch { flash.show(url); }
  }

  const tabs: [Tab, string][] = [["saldos", "Saldos de packs"], ["membresias", "Membresías"]];
  if (canSell) tabs.push(["catalogo", "Catálogo"]);
  const e = exp.data;
  return (
    <div data-tour="packs">
      <PageHeader eyebrow="PACKS" title="Packs y membresías" subtitle="Sesiones prepagas y abonos mensuales: saldo, vencimientos y renovaciones.">
        {canSell && <><button className="secondary-button" onClick={() => setSellMem(true)}>Alta de membresía</button><button className="primary-button" onClick={() => setSellPack(true)} data-tour="packs-vender">Vender pack</button></>}
      </PageHeader>
      {e && (e.packs.length > 0 || e.memberships.length > 0) && (
        <div className="tn-kpis">
          <Kpi label="Packs por vencer (7 días)" value={e.packs.length} tone={e.packs.length ? "warn" : undefined} onClick={() => { setTab("saldos"); setStatus("ACTIVO"); }} />
          <Kpi label="Membresías por renovar o vencidas" value={e.memberships.length} tone={e.memberships.length ? "warn" : undefined} onClick={() => { setTab("membresias"); setMstatus(""); }} />
        </div>)}
      <Tabs value={tab} onChange={setTab} options={tabs} />

      {tab === "saldos" && (
        <div className="tn-stack">
          <div className="tn-filters">
            <input className="tn-search" placeholder="Buscar por cliente" aria-label="Buscar por cliente" value={q} onChange={(ev) => setQ(ev.target.value)} />
            <select aria-label="Estado" value={status} onChange={(ev) => setStatus(ev.target.value)}><option value="ACTIVO">Con sesiones</option><option value="">Todos</option><option value="AGOTADO">Agotados</option><option value="VENCIDO">Vencidos</option></select>
          </div>
          <ErrorNote text={packs.error} />
          {packs.loading && !packs.data && <Loading />}
          {packs.data && packs.data.length === 0 && <Empty title="No hay packs con ese filtro">{canSell ? "Vendé un pack desde el botón de arriba: queda el saldo de sesiones del cliente." : "Los packs de tus clientes aparecen acá."}</Empty>}
          {packs.data && packs.data.length > 0 && (
            <div className="tn-table-wrap">
              <table className="tn-table">
                <thead><tr><th>Cliente</th><th>Pack</th><th className="num">Sesiones</th><th>Vence</th><th>Estado</th><th /></tr></thead>
                <tbody>
                  {packs.data.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.customer_name}</strong></td><td>{p.name}<small>comprado el {dmy(p.purchased_on)}</small></td>
                      <td className="num"><strong>{p.sessions_left}</strong> de {p.sessions_total}</td>
                      <td>{p.expires_on ? <>{dmy(p.expires_on)}{p.status === "ACTIVO" && p.days_left !== null && p.days_left <= 7 && <Pill tone="orange">{p.days_left} días</Pill>}</> : "No vence"}</td>
                      <td><Pill tone={PACK_TONE[p.status]}>{PACK_LABEL[p.status]}</Pill></td>
                      <td><div className="g3-actions">
                        <button className="secondary-button g3-small" onClick={() => setDetail(p.id)}>Ver y canjear</button>
                        {canSell && p.status === "ACTIVO" && <WaButton phoneWa={p.customer_phone_wa} text={packMsg(p, local)} label="Avisar" />}
                        {canSell && p.token && <button className="tn-link-button" onClick={() => copyLink(p.token)}>Copiar link</button>}
                      </div></td>
                    </tr>))}
                </tbody>
              </table>
            </div>)}
        </div>)}

      {tab === "membresias" && (
        <div className="tn-stack">
          <div className="tn-filters">
            <input className="tn-search" placeholder="Buscar por cliente" aria-label="Buscar por cliente" value={q} onChange={(ev) => setQ(ev.target.value)} />
            <select aria-label="Estado" value={mstatus} onChange={(ev) => setMstatus(ev.target.value)}><option value="">Todas</option><option value="ACTIVA">Al día</option><option value="VENCIDA">Vencidas</option><option value="PAUSADA">En pausa</option><option value="BAJA">De baja</option></select>
          </div>
          <ErrorNote text={mems.error} />
          {mems.loading && !mems.data && <Loading />}
          {mems.data && mems.data.length === 0 && <Empty title="No hay membresías con ese filtro">{canSell ? "Dá de alta la primera desde «Alta de membresía»." : ""}</Empty>}
          {mems.data && mems.data.length > 0 && (
            <div className="tn-table-wrap">
              <table className="tn-table">
                <thead><tr><th>Cliente</th><th>Plan</th><th>Pagada hasta</th><th className="num">Sesiones del período</th><th>Estado</th><th /></tr></thead>
                <tbody>
                  {mems.data.map((m) => (
                    <tr key={m.id}>
                      <td><strong>{m.customer_name}</strong></td><td>{m.plan_name}<small>{money(m.price)} por período</small></td>
                      <td>{m.paid_until ? dmy(m.paid_until) : "—"}{m.status === "ACTIVA" && m.days_left !== null && m.days_left <= 7 && <Pill tone="orange">{m.days_left < 0 ? "Por cobrar" : `${m.days_left} días`}</Pill>}</td>
                      <td className="num">{m.included_sessions ? `${m.sessions_left} de ${m.included_sessions}` : m.discount_pct ? `${m.discount_pct}% desc.` : "—"}</td>
                      <td><Pill tone={PACK_TONE[m.status]}>{PACK_LABEL[m.status]}</Pill>{m.baja_code && <small>Baja {m.baja_code}</small>}</td>
                      <td>
                        {canSell && m.status !== "BAJA" && (
                          <div className="g3-actions">
                            {m.status !== "PAUSADA" && <button className="primary-button g3-small" onClick={() => setRenew(m)}>Renovar</button>}
                            {(m.status === "ACTIVA" || m.status === "VENCIDA") && <WaButton phoneWa={m.customer_phone_wa} text={memMsg(m, local)} label="Avisar" />}
                            {m.status === "PAUSADA" ? <button className="secondary-button g3-small" onClick={() => pause(m, true)}>Reanudar</button>
                              : m.status === "ACTIVA" && <button className="secondary-button g3-small" onClick={() => pause(m, false)}>Pausar</button>}
                            <button className="g3-linkd" onClick={() => setCancel(m)}>Dar de baja</button>
                            {m.token && <button className="tn-link-button" onClick={() => copyLink(m.token)}>Copiar link</button>}
                          </div>)}
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>)}
          <p className="tn-hint">No hay débito automático: al vencer el período, renovás y cobrás desde acá. Sin pago a los 3 días del vencimiento queda como vencida.</p>
        </div>)}

      {tab === "catalogo" && canSell && <CatalogTab canEdit={canEdit} version={version} onChanged={() => { bump(); flash.show("Guardado"); }} />}
      {sellPack && <SellPackModal templates={tpls.data || []} onClose={() => setSellPack(false)} onDone={done} />}
      {sellMem && <SellMembershipModal plans={plans.data || []} onClose={() => setSellMem(false)} onDone={done} />}
      {detail !== null && <PackDetailModal id={detail} onClose={() => setDetail(null)} onChanged={bump} />}
      {renew && <RenewModal m={renew} onClose={() => setRenew(null)} onDone={done} />}
      {cancel && <CancelMembershipModal m={cancel} onClose={() => setCancel(null)} onDone={done} />}
      {flash.node}
    </div>
  );
}
