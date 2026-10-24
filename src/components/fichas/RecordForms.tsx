// Historial de la ficha: entradas por plantilla (fórmulas, evolución, registro de trabajo). No se editan: se enmiendan.
import { Fragment, useEffect, useMemo, useState } from "react";
import { appApi, shortDate } from "../../config";
import { Empty, Field, Loading, Modal, Pill } from "../ui";
import { showValue } from "./shared";
import type { ConsentItem, FieldDef, Ficha, RecTemplate, RecordItem } from "./shared";

interface Notify { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }
interface LotLite { id: number; name: string; kind: string; lot_code: string | null; expires_on: string | null; qty_left: number; status: string }
interface CycleLite { id: number; lot_code: string | null; date_time: string; indicator_result: string; equipment_name: string | null }
interface MatRow { lot_id: number | ""; qty: string; cycle_id: number | "" }

export function FieldInput({ f, value, onChange }: { f: FieldDef; value: any; onChange: (v: any) => void }) {
  const label = <>{f.label}{f.required ? " *" : ""}</>;
  if (f.type === "check") return <label className="g2-check" style={{ gridColumn: "1 / -1" }}><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>;
  if (f.type === "opcion") return <Field label={label}><select value={value ?? ""} onChange={(e) => onChange(e.target.value)}><option value="">Elegir…</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select></Field>;
  if (f.type === "numero") return <Field label={label}><input type="number" step="any" value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></Field>;
  if (f.type === "fecha") return <Field label={label}><input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></Field>;
  return <Field label={label} wide={f.type === "texto" && f.label.length > 40}><input value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></Field>;
}

/** Alta de una entrada (o corrección, con `amend`). En tatuajes, el registro de trabajo pide consentimiento, lote y esterilización. */
export function RecordForm({ ficha, template, templates, amend, consents, appointmentId, onDone, onCancel, notify }: {
  ficha: Ficha; template?: RecTemplate; templates: RecTemplate[]; amend?: RecordItem; consents: ConsentItem[]; appointmentId?: number | null;
  onDone: (r: RecordItem) => void; onCancel?: () => void; notify: Notify;
}) {
  const [tplId, setTplId] = useState<number | "">(template?.id ?? templates[0]?.id ?? "");
  const tpl = templates.find((t) => t.id === tplId) || null;
  const [data, setData] = useState<Record<string, any>>(() => (amend ? Object.fromEntries(Object.entries(amend.data).filter(([k]) => !k.startsWith("_"))) : {}));
  const [notes, setNotes] = useState(amend?.notes || "");
  const [reason, setReason] = useState("");
  const [mats, setMats] = useState<MatRow[]>([]);
  const [factory, setFactory] = useState(false);
  const [consentId, setConsentId] = useState<number | "">("");
  const [lots, setLots] = useState<LotLite[]>([]);
  const [cycles, setCycles] = useState<CycleLite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isWork = !amend && tpl?.kind === "TRABAJO";
  const needsTrace = isWork && ficha.tattoo_mode;
  const numbered = useMemo(() => consents.filter((c) => c.number !== null && c.valid), [consents]);

  useEffect(() => {
    if (!isWork) return;
    appApi<LotLite[]>("/material-lots?only_available=true").then(setLots).catch(() => setLots([]));
    appApi<{ items: CycleLite[] }>("/sterilization-cycles").then((r) => setCycles(r.items.filter((c) => c.indicator_result !== "NO_CONFORME"))).catch(() => setCycles([]));
  }, [isWork]);
  useEffect(() => { if (isWork && !consentId && numbered.length) setConsentId(numbered[0].id); }, [isWork, numbered, consentId]);

  async function save() {
    setError("");
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== "" && v !== undefined));
      let r: RecordItem;
      if (amend) {
        r = await appApi<RecordItem>(`/records/${amend.id}/amend`, { method: "POST", body: { reason, data: clean, notes } });
      } else {
        r = await appApi<RecordItem>(`/customers/${ficha.customer.id}/records`, { method: "POST", body: {
          template_id: tpl?.id, data: clean, notes, appointment_id: appointmentId || null, consent_id: consentId || null, factory_sterile: factory,
          materials: mats.filter((m) => m.lot_id).map((m) => ({ lot_id: m.lot_id, qty: Number(m.qty.replace(",", ".")) || 1, sterilization_cycle_id: m.cycle_id || null })) } });
      }
      notify.show(amend ? "Corrección guardada" : "Entrada guardada");
      onDone(r);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }

  const fields = tpl?.fields || [];
  return (
    <div className="tn-stack">
      {error && <div className="tn-note tn-note-error" role="alert">{error}</div>}
      {!amend && !template && (
        <Field label="Tipo de entrada"><select value={tplId} onChange={(e) => { setTplId(Number(e.target.value)); setData({}); }}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>)}
      {amend && <div className="tn-note tn-note-warn">La entrada original se conserva tal cual. Esta corrección queda enlazada y con el motivo.</div>}
      {amend && <Field label="Motivo de la corrección *"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: me equivoqué de zona" /></Field>}
      {tpl && <div className="g2-form-grid">{fields.map((f) => <FieldInput key={f.key} f={f} value={data[f.key]} onChange={(v) => setData((d) => ({ ...d, [f.key]: v }))} />)}</div>}
      <Field label="Notas"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {isWork && (
        <div className="tn-stack">
          <Field label={needsTrace ? "Consentimiento numerado de este trabajo *" : "Consentimiento"} hint="Se guarda el número en el registro.">
            <select value={consentId} onChange={(e) => setConsentId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">{numbered.length ? "Elegir…" : "No hay consentimientos numerados vigentes"}</option>
              {numbered.map((c) => <option key={c.id} value={c.id}>N.º {c.number} · {c.title} · {shortDate(c.signed_at)}</option>)}
            </select>
          </Field>
          <div>
            <strong style={{ fontSize: 14 }}>Material usado {needsTrace && "*"}</strong>
            <span className="tn-hint">Tintas, agujas, joyería: lote y ciclo de esterilización. Se descuenta del lote.</span>
            {mats.map((m, i) => (
              <div key={i} className="tn-row-edit" style={{ marginTop: 8 }}>
                <select value={m.lot_id} onChange={(e) => setMats((a) => a.map((x, j) => (j === i ? { ...x, lot_id: e.target.value ? Number(e.target.value) : "" } : x)))} aria-label="Lote">
                  <option value="">Lote…</option>{lots.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.lot_code || "s/lote"} · quedan {l.qty_left}</option>)}
                </select>
                <input value={m.qty} inputMode="decimal" onChange={(e) => setMats((a) => a.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} aria-label="Cantidad" />
                <select value={m.cycle_id} onChange={(e) => setMats((a) => a.map((x, j) => (j === i ? { ...x, cycle_id: e.target.value ? Number(e.target.value) : "" } : x)))} aria-label="Ciclo de esterilización">
                  <option value="">Ciclo…</option>{cycles.map((c) => <option key={c.id} value={c.id}>{c.lot_code} · {c.equipment_name}</option>)}
                </select>
                <button type="button" className="tn-link tn-link-danger" onClick={() => setMats((a) => a.filter((_, j) => j !== i))}>Quitar</button>
              </div>))}
            <div style={{ marginTop: 8 }}><button type="button" className="secondary-button g2-small-btn" onClick={() => setMats((a) => [...a, { lot_id: "", qty: "1", cycle_id: "" }])}>+ Agregar material</button></div>
            {!lots.length && <span className="tn-hint">No hay lotes cargados: se cargan en Bioseguridad → Lotes y material.</span>}
          </div>
          <label className="g2-check"><input type="checkbox" checked={factory} onChange={(e) => setFactory(e.target.checked)} /><span>Descartable estéril de fábrica (reemplaza al ciclo de esterilización)</span></label>
        </div>)}
      <div className="tn-row" style={{ justifyContent: "flex-end" }}>
        {onCancel && <button className="secondary-button" onClick={onCancel} disabled={busy}>Cancelar</button>}
        <button className="primary-button" onClick={save} disabled={busy || !tpl || (!!amend && reason.trim().length < 3)}>{busy ? "Guardando..." : amend ? "Guardar corrección" : "Guardar entrada"}</button>
      </div>
    </div>
  );
}

export function RecordCard({ r, tpl, onAmend }: { r: RecordItem; tpl?: RecTemplate; onAmend?: (r: RecordItem) => void }) {
  const labels: Record<string, string> = r.data._labels || {};
  const fieldLabel = (k: string) => tpl?.fields.find((f) => f.key === k)?.label || labels[k] || k;
  const entries = Object.entries(r.data).filter(([k]) => !k.startsWith("_"));
  return (
    <div className={`g2-record ${r.amended_by_id ? "is-old" : ""}`}>
      <div className="tn-row" style={{ justifyContent: "space-between" }}>
        <h3>{r.template_name}</h3>
        <span className="tn-hint" style={{ margin: 0 }}>{shortDate(r.date)}{r.professional_name ? ` · ${r.professional_name}` : ""}</span>
      </div>
      <div className="tn-prod-badges">
        <Pill tone="gray">Cerrada: no se edita</Pill>
        {r.amends_id && <Pill tone="violet">Corrige la entrada #{r.amends_id}</Pill>}
        {r.amended_by_id && <Pill tone="orange">Reemplazada por una corrección</Pill>}
        {r.consent_number && <Pill tone="violet">Consentimiento N.º {r.consent_number}</Pill>}
        {r.data._factory_sterile && <Pill tone="gray">Descartable estéril de fábrica</Pill>}
      </div>
      {entries.length > 0 && <dl className="g2-dl">{entries.map(([k, v]) => <Fragment key={k}><dt>{fieldLabel(k)}</dt><dd>{showValue(v)}</dd></Fragment>)}</dl>}
      {r.notes && <p style={{ margin: 0, fontSize: 13.5, color: "var(--tn-ink)" }}>{r.notes}</p>}
      {r.materials.length > 0 && (
        <div style={{ fontSize: 13 }}><b>Material:</b> {r.materials.map((m) => `${m.name} (lote ${m.lot_code || "—"}, x${m.qty}${m.cycle_code ? `, ciclo ${m.cycle_code}` : ""})`).join(" · ")}</div>)}
      {r.data._amend_reason && <div className="tn-hint" style={{ margin: 0 }}>Motivo de la corrección: {r.data._amend_reason}</div>}
      {onAmend && !r.amended_by_id && <div><button className="secondary-button g2-small-btn" onClick={() => onAmend(r)}>Corregir</button></div>}
    </div>
  );
}

export function HistorialTab({ ficha, notify, onChanged }: { ficha: Ficha; notify: Notify; onChanged: () => void }) {
  const cid = ficha.customer.id;
  const [rows, setRows] = useState<RecordItem[] | null>(null);
  const [tpls, setTpls] = useState<RecTemplate[] | null>(null);
  const [consents, setConsents] = useState<ConsentItem[]>([]);
  const [kind, setKind] = useState("");
  const [adding, setAdding] = useState(false);
  const [amend, setAmend] = useState<RecordItem | null>(null);
  const load = () => appApi<RecordItem[]>(`/customers/${cid}/records`).then(setRows).catch(notify.fail);
  useEffect(() => {
    load();
    appApi<RecTemplate[]>("/record-templates").then(setTpls).catch(() => setTpls([]));
    appApi<ConsentItem[]>(`/customers/${cid}/consents`).then(setConsents).catch(() => setConsents([]));
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows || !tpls) return <Loading />;
  const shown = rows.filter((r) => !kind || r.kind === kind);
  const tplOf = (r: RecordItem) => tpls.find((t) => t.id === r.template_id);
  return (
    <div className="tn-stack">
      <div className="g2-head"><div><h2>Historial</h2><small>Fórmulas, evolución y trabajos. Una entrada cerrada no se edita: se corrige con otra que la reemplaza.</small></div>
        <button className="primary-button" onClick={() => setAdding(true)} disabled={!tpls.length}>Nueva entrada</button></div>
      <div className="tn-chips">{[["", "Todo"], ["FORMULA", "Fórmulas"], ["FICHA", "Fichas"], ["TRABAJO", "Trabajos"], ["CUIDADOS", "Cuidados"]].map(([k, l]) => (
        <button key={k} className={`tn-chip ${kind === k ? "is-on" : ""}`} onClick={() => setKind(k)}>{l}</button>))}</div>
      {!tpls.length && <div className="tn-note tn-note-warn">No hay plantillas de ficha. Cargá las sugeridas del rubro en Configuración, o creá una en Plantillas.</div>}
      {!shown.length ? <Empty title="Sin entradas">Todavía no hay nada cargado{kind ? " de este tipo" : ""}.</Empty> : <div className="g2-list">{shown.map((r) => <RecordCard key={r.id} r={r} tpl={tplOf(r)} onAmend={setAmend} />)}</div>}
      {adding && <Modal eyebrow="HISTORIAL" title="Nueva entrada" size="xl" onClose={() => setAdding(false)}>
        <RecordForm ficha={ficha} templates={tpls} consents={consents} notify={notify} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); load(); onChanged(); }} /></Modal>}
      {amend && <Modal eyebrow="CORREGIR" title={amend.template_name} size="xl" onClose={() => setAmend(null)}>
        <RecordForm ficha={ficha} templates={tpls} template={tplOf(amend)} amend={amend} consents={consents} notify={notify} onCancel={() => setAmend(null)} onDone={() => { setAmend(null); load(); onChanged(); }} /></Modal>}
    </div>
  );
}
