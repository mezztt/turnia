// Comisiones (G3): reglas con herencia visible, liquidación por período, adelantos y «Mi comisión» del profesional.
import { useEffect, useState } from "react";
import { appApi, getSessionUser, money, vocab } from "../../../config";
import { Empty, Loading, PageHeader, Pill, Tabs, useFlash } from "../../../components/ui";
import { ConfirmModal } from "../../../components/r1/common";
import { printSettlement } from "../../../pages/print/g3print";
import type { SettlementPrint } from "../../../pages/print/g3print";
import { ErrorNote, dmy, errMsg, useLoad } from "../../../components/g3/common";
import type { ProLite } from "../../../components/g3/types";
import { proName } from "../../../components/g3/types";
import {
  AdjustmentList, AdjustmentModal, LinesTable, PeriodBar, RulesTab, SettlementModal, SettlementsTab, TotalsKpis, periodPreset,
} from "../../../components/g3/ComisionesPanels";
import type { Preview, Settlement } from "../../../components/g3/ComisionesPanels";

interface Overview { professional_id: number; professional_name: string; lines: number; commission_total: number; tips_total: number; adjustments_total: number; total_to_pay: number }

export default function ComisionesPage() {
  const user = getSessionUser();
  return user?.role === "PROFESIONAL" ? <MiComision /> : <Gestion />;
}

function Gestion() {
  const user = getSessionUser();
  const isAdmin = user?.role === "ADMINISTRADOR";
  const flash = useFlash();
  const [tab, setTab] = useState<"liquidar" | "liquidaciones" | "reglas">("liquidar");
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((n) => n + 1);
  const [range, setRange] = useState<[string, string]>(periodPreset("mes"));
  const [pro, setPro] = useState<number | null>(null);
  return (
    <div data-tour="comisiones">
      <PageHeader eyebrow="COMISIONES" title="Comisiones" subtitle="Lo que genera cada profesional, liquidado por período. Es un cálculo de gestión, no un recibo de sueldo." />
      <Tabs value={tab} onChange={setTab} options={[["liquidar", "Liquidar"], ["liquidaciones", "Liquidaciones cerradas"], ["reglas", "Reglas"]]} />
      {tab === "liquidar" && (pro === null
        ? <Overview range={range} setRange={setRange} version={version} onPick={setPro} />
        : <Detail key={`${pro}-${range.join()}-${version}`} proId={pro} range={range} setRange={setRange} onBack={() => setPro(null)} onChanged={bump} flash={flash} />)}
      {tab === "liquidaciones" && <SettlementsTab version={version} canManage onChanged={bump} />}
      {tab === "reglas" && <RulesTab canEdit={isAdmin} onSaved={() => { bump(); flash.show("Reglas guardadas"); }} />}
      {flash.node}
    </div>
  );
}

function Overview({ range, setRange, version, onPick }: { range: [string, string]; setRange: (r: [string, string]) => void; version: number; onPick: (id: number) => void }) {
  const v = vocab(getSessionUser());
  const { data, error, loading } = useLoad<Overview[]>(`/commissions/overview?from_date=${range[0]}&to_date=${range[1]}&v=${version}`);
  const total = (data || []).reduce((s, r) => s + r.total_to_pay, 0);
  return (
    <div className="tn-stack">
      <PeriodBar range={range} onChange={setRange} />
      <ErrorNote text={error} />
      {loading && !data && <Loading />}
      {data && data.length === 0 && <Empty title="Nada para liquidar en este período">Las comisiones se generan solas al cobrar ventas con un {v.profesional} asignado.</Empty>}
      {data && data.length > 0 && (
        <>
          <div className="tn-table-wrap">
            <table className="tn-table">
              <thead><tr><th>{v.profesional.charAt(0).toUpperCase() + v.profesional.slice(1)}</th><th className="num">Líneas</th><th className="num">Comisiones</th><th className="num">Propinas</th><th className="num">Ajustes</th><th className="num">A pagar</th><th /></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.professional_id}>
                    <td><strong>{r.professional_name}</strong></td><td className="num">{r.lines}</td><td className="num">{money(r.commission_total)}</td><td className="num">{money(r.tips_total)}</td>
                    <td className="num">{r.adjustments_total === 0 ? "—" : (r.adjustments_total > 0 ? "+" : "") + money(r.adjustments_total)}</td>
                    <td className="num"><strong>{money(r.total_to_pay)}</strong></td>
                    <td><button className="secondary-button g3-small" onClick={() => onPick(r.professional_id)}>Ver y liquidar</button></td>
                  </tr>))}
              </tbody>
              <tfoot><tr><td colSpan={5}>Total del período</td><td className="num">{money(total)}</td><td /></tr></tfoot>
            </table>
          </div>
          <p className="tn-hint">Se muestran solo las comisiones todavía no liquidadas. Al cerrar un período, esas líneas quedan bloqueadas y no entran en otra liquidación.</p>
        </>)}
    </div>
  );
}

function Detail({ proId, range, setRange, onBack, onChanged, flash }: {
  proId: number; range: [string, string]; setRange: (r: [string, string]) => void; onBack: () => void; onChanged: () => void; flash: ReturnType<typeof useFlash>;
}) {
  const [reload, setReload] = useState(0);
  const prev = useLoad<Preview>(`/commissions/preview?professional_id=${proId}&from_date=${range[0]}&to_date=${range[1]}&r=${reload}`);
  const pros = useLoad<ProLite[]>("/professionals");
  const [adj, setAdj] = useState(false);
  const [closing, setClosing] = useState(false);
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState<Settlement | null>(null);
  const p = prev.data;
  async function close() {
    try { setDone(await appApi<Settlement>("/commissions/settlements", { method: "POST", body: { professional_id: proId, from_date: range[0], to_date: range[1], notes: notes.trim() || null } })); setClosing(false); onChanged(); } catch (e) { flash.fail(e); setClosing(false); }
  }
  async function print() {
    if (!p) return;
    printSettlement({ id: 0, local: getSessionUser()?.company_name || "", legal: "Documento no válido como factura ni recibo de sueldo", note: "Vista previa: todavía no está cerrada.", status: "ABIERTA",
      professional_name: p.professional_name, from_date: p.from_date, to_date: p.to_date, commission_total: p.commission_total, tips_total: p.tips_total, adjustments_total: p.adjustments_total,
      total_to_pay: p.total_to_pay, paid_at: null, lines: p.lines, adjustments: p.adjustments });
  }
  return (
    <div className="tn-stack">
      <button className="g2-back" onClick={onBack}>‹ Volver a todos</button>
      <PeriodBar range={range} onChange={setRange}>
        <select aria-label="Profesional" value={proId} onChange={() => undefined} disabled>
          {(pros.data || []).filter((x) => x.id === proId).map((x) => <option key={x.id} value={x.id}>{proName(x)}</option>)}
        </select>
      </PeriodBar>
      <ErrorNote text={prev.error} />
      {prev.loading && !p && <Loading />}
      {p && (
        <>
          <div className="tn-spread"><h2 className="g3-h2">{p.professional_name}</h2>
            <div className="tn-row"><button className="secondary-button" onClick={() => setAdj(true)}>Adelanto, descuento o bono</button><button className="secondary-button" onClick={print}>Imprimir</button>
              <button className="primary-button" onClick={() => setClosing(true)} disabled={p.lines.length === 0 && p.adjustments.length === 0} data-tour="comisiones-cerrar">Cerrar período</button></div></div>
          <TotalsKpis p={p} />
          <LinesTable lines={p.lines} />
          <AdjustmentList adjs={p.adjustments} canEdit onRemoved={() => setReload((n) => n + 1)} />
        </>)}
      {adj && p && <AdjustmentModal professionalId={proId} professionalName={p.professional_name} onClose={() => setAdj(false)} onSaved={() => { setAdj(false); setReload((n) => n + 1); flash.show("Registrado"); }} />}
      {closing && p && (
        <ConfirmModal title="¿Cerrar este período?" confirmLabel="Cerrar y bloquear" onConfirm={close} onClose={() => setClosing(false)}>
          Se guarda la liquidación de {p.professional_name} ({dmy(p.from_date)} a {dmy(p.to_date)}) por <strong>{money(p.total_to_pay)}</strong>. Las líneas quedan bloqueadas.
          <div style={{ marginTop: 10 }}><input aria-label="Nota de la liquidación" placeholder="Nota (opcional)" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} style={{ width: "100%" }} /></div>
        </ConfirmModal>)}
      {done && <SettlementModal id={done.id} canManage onClose={() => { setDone(null); onBack(); }} onChanged={onChanged} />}
    </div>
  );
}

// ----------------------------------------------------------------------------------------------------------------
interface Mine { current: Preview; settlements: Settlement[] }
function MiComision() {
  const [range, setRange] = useState<[string, string]>(periodPreset("mes"));
  const { data, error, loading } = useLoad<Mine>(`/me/commissions?from_date=${range[0]}&to_date=${range[1]}`);
  const [err, setErr] = useState("");
  useEffect(() => setErr(""), [range]);
  async function print(id: number) {
    try { printSettlement(await appApi<SettlementPrint>(`/commissions/settlements/${id}/print`)); } catch (e) { setErr(errMsg(e)); }
  }
  return (
    <div data-tour="comisiones">
      <PageHeader eyebrow="COMISIONES" title="Mi comisión" subtitle="Lo que vas generando. Solo ves lo tuyo." />
      <div className="tn-stack">
        <PeriodBar range={range} onChange={setRange} />
        <ErrorNote text={error || err} />
        {loading && !data && <Loading />}
        {data && (
          <>
            <TotalsKpis p={data.current} />
            <LinesTable lines={data.current.lines} />
            <AdjustmentList adjs={data.current.adjustments} canEdit={false} onRemoved={() => undefined} />
            <div className="tn-card">
              <h2>Mis liquidaciones</h2>
              {data.settlements.length === 0 ? <Empty title="Todavía no tenés liquidaciones cerradas" /> : (
                <ul className="tn-list">
                  {data.settlements.map((s) => (
                    <li key={s.id}>
                      <div className="tn-list-main"><strong>{dmy(s.from_date)} a {dmy(s.to_date)}</strong><small>Comisiones {money(s.commission_total)} · propinas {money(s.tips_total)}</small></div>
                      <Pill tone={s.status === "PAGADA" ? "green" : "orange"}>{s.status === "PAGADA" ? "Pagada" : "Por pagar"}</Pill>
                      <span className="tn-list-amount">{money(s.total_to_pay)}</span>
                      <button className="secondary-button g3-small" onClick={() => print(s.id)}>Imprimir</button>
                    </li>))}
                </ul>)}
            </div>
            <p className="tn-hint">Cálculo de gestión del local: no es recibo de sueldo. Documento no válido como factura.</p>
          </>)}
      </div>
    </div>
  );
}
