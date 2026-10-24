// Salud del cliente: alergias, contraindicaciones y condiciones (dato sensible: solo con consentimiento) y test de parche.
import { useEffect, useState } from "react";
import { appApi, dateTime, getSessionUser, shortDate, vocab } from "../../config";
import { Empty, Field, Loading, Modal, Pill, strOrNull } from "../ui";
import { ConfirmModal } from "../r1/common";
import { PATCH_LABEL, SEVERITY_LABEL, SEVERITY_TONE } from "./shared";
import type { Ficha, Flag } from "./shared";

interface Notify { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }
interface PatchTest { id: number; product_text: string; applied_on: string; result: string; read_on: string | null; professional_name: string | null; notes: string | null }
interface PatchData { items: PatchTest[]; status: string; last_on: string | null; valid_until: string | null; days: number }
const KINDS: [string, string][] = [["ALERGIA", "Alergia"], ["CONTRAINDICACION", "Contraindicación"], ["CONDICION", "Condición de salud"], ["MEDICACION", "Medicación"], ["EMBARAZO", "Embarazo o lactancia"], ["INFECCIOSA", "Enfermedad infectocontagiosa"], ["OTRO", "Otro"]];

export function SaludTab({ ficha, notify, onChanged }: { ficha: Ficha; notify: Notify; onChanged: () => void }) {
  const cid = ficha.customer.id;
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [off, setOff] = useState<Flag | null>(null);
  const load = () => appApi<Flag[]>(`/customers/${cid}/health-flags`).then(setFlags).catch(notify.fail);
  useEffect(() => { load(); }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!flags) return <Loading />;
  const active = flags.filter((f) => f.active);
  const inactive = flags.filter((f) => !f.active);

  async function toggle(f: Flag) {
    try { await appApi(`/customers/${cid}/health-flags/${f.id}`, { method: "PUT", body: { active: !f.active } }); setOff(null); load(); onChanged(); } catch (e) { notify.fail(e); }
  }
  return (
    <div className="tn-stack">
      <div className="tn-card">
        <div className="g2-head"><div><h2>Alergias y contraindicaciones</h2><small>Dato sensible (Ley 25.326): solo se guarda si el cliente lo acepta. Cada vez que se ve o se cambia queda registrado.</small></div>
          <button className="primary-button" onClick={() => setAdding(true)}>Registrar dato de salud</button></div>
        {!ficha.health_declared && <div className="tn-note tn-note-warn" style={{ marginBottom: 12 }}>Todavía no hay declaración de salud firmada. {ficha.tattoo_mode ? "En tatuajes y piercing es obligatoria para poder trabajar." : "Se firma en Consentimientos → «Datos de salud»."}</div>}
        {!active.length ? <Empty title="Sin alergias ni contraindicaciones cargadas">Si el cliente cuenta algo, registralo con su consentimiento. Si prefiere no decirlo, el {vocab(getSessionUser()).turno} sigue igual.</Empty> : (
          <div className="g2-list">{active.map((f) => (
            <div key={f.id} className="g2-row">
              <div className="g2-row-main"><strong>{f.kind_label}: {f.text}</strong><small>Aceptó guardarlo el {dateTime(f.consent_at)} · lo contó {f.source === "CLIENTE" ? "el cliente" : "al profesional"}</small></div>
              <div className="g2-row-actions"><Pill tone={SEVERITY_TONE[f.severity]}>{SEVERITY_LABEL[f.severity]}</Pill><button className="secondary-button g2-small-btn" onClick={() => setOff(f)}>Dar de baja</button></div>
            </div>))}</div>)}
        {inactive.length > 0 && <details style={{ marginTop: 12 }}><summary style={{ cursor: "pointer", color: "var(--tn-muted)", fontWeight: 700 }}>Dados de baja ({inactive.length})</summary>
          <div className="g2-list" style={{ marginTop: 8 }}>{inactive.map((f) => (
            <div key={f.id} className="g2-row"><div className="g2-row-main"><strong>{f.kind_label}: {f.text}</strong><small>Dado de baja</small></div>
              <button className="secondary-button g2-small-btn" onClick={() => toggle(f)}>Reactivar</button></div>))}</div></details>}
      </div>
      <PatchTests customerId={cid} notify={notify} onChanged={onChanged} />
      {adding && <FlagModal customerId={cid} notify={notify} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); onChanged(); }} />}
      {off && <ConfirmModal title="Dar de baja el dato" confirmLabel="Dar de baja" onConfirm={() => toggle(off)} onClose={() => setOff(null)}>«{off.text}» deja de mostrarse como alerta. Queda registrado quién lo hizo.</ConfirmModal>}
    </div>
  );
}

export function FlagModal({ customerId, notify, onClose, onDone }: { customerId: number; notify: Notify; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState("ALERGIA");
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState("ATENCION");
  const [source, setSource] = useState("CLIENTE");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try { await appApi(`/customers/${customerId}/health-flags`, { method: "POST", body: { kind, text, severity, source, consent } }); notify.show("Dato de salud guardado"); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="SALUD" title="Registrar dato de salud" onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save} disabled={busy || !consent || text.trim().length < 2}>{busy ? "Guardando..." : "Guardar"}</button></>}>
      <div className="tn-stack">
        {error && <div className="tn-note tn-note-error" role="alert">{error}</div>}
        <div className="g2-form-grid">
          <Field label="Tipo"><select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Gravedad"><select value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="INFO">Informativo</option><option value="ATENCION">Atención</option><option value="GRAVE">Grave (banner rojo)</option></select></Field>
          <Field label="Qué es" wide><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: látex, amoníaco, embarazo de 5 meses" /></Field>
          <Field label="Quién lo contó"><select value={source} onChange={(e) => setSource(e.target.value)}><option value="CLIENTE">El cliente</option><option value="PROFESIONAL">Lo observó el profesional</option></select></Field>
        </div>
        <label className="g2-check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span><b>El cliente aceptó que guardemos este dato.</b> Sabe que es un dato sensible, que solo lo ve el equipo que lo necesita y que puede pedir verlo, corregirlo o borrarlo.</span></label>
      </div>
    </Modal>
  );
}

function PatchTests({ customerId, notify, onChanged }: { customerId: number; notify: Notify; onChanged: () => void }) {
  const [data, setData] = useState<PatchData | null>(null);
  const [adding, setAdding] = useState(false);
  const [reading, setReading] = useState<PatchTest | null>(null);
  const load = () => appApi<PatchData>(`/customers/${customerId}/patch-tests`).then(setData).catch(notify.fail);
  useEffect(() => { load(); }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <Loading />;
  const [label, tone] = PATCH_LABEL[data.status] || [data.status, "gray"];
  return (
    <div className="tn-card" data-tour="ficha-parche">
      <div className="g2-head"><div><h2>Test de parche</h2><small>Vale {data.days} días si dio negativo.</small></div><div className="tn-row"><Pill tone={tone}>{label}</Pill><button className="primary-button" onClick={() => setAdding(true)}>Registrar test</button></div></div>
      {data.valid_until && <p className="tn-hint" style={{ marginTop: 0 }}>Vigente hasta el {shortDate(data.valid_until)}.</p>}
      {!data.items.length ? <Empty title="Sin tests de parche">Antes de una tintura o decoloración conviene hacerlo y esperar 48 horas.</Empty> : (
        <div className="g2-list">{data.items.map((t) => (
          <div key={t.id} className="g2-row">
            <div className="g2-row-main"><strong>{t.product_text}</strong><small>Aplicado el {shortDate(t.applied_on)}{t.read_on ? ` · leído el ${shortDate(t.read_on)}` : ""}{t.professional_name ? ` · ${t.professional_name}` : ""}{t.notes ? ` · ${t.notes}` : ""}</small></div>
            <div className="g2-row-actions"><Pill tone={t.result === "NEGATIVO" ? "green" : t.result === "POSITIVO" ? "red" : "orange"}>{t.result === "SIN_LECTURA" ? "Sin lectura" : t.result === "NEGATIVO" ? "Negativo" : "Positivo"}</Pill>
              {t.result === "SIN_LECTURA" && <button className="secondary-button g2-small-btn" onClick={() => setReading(t)}>Cargar lectura</button>}</div>
          </div>))}</div>)}
      {adding && <PatchModal customerId={customerId} notify={notify} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); onChanged(); }} />}
      {reading && <ReadModal test={reading} notify={notify} onClose={() => setReading(null)} onDone={() => { setReading(null); load(); onChanged(); }} />}
    </div>
  );
}

function PatchModal({ customerId, notify, onClose, onDone }: { customerId: number; notify: Notify; onClose: () => void; onDone: () => void }) {
  const [product, setProduct] = useState("");
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState("SIN_LECTURA");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try { await appApi(`/customers/${customerId}/patch-tests`, { method: "POST", body: { product_text: product, applied_on: on, result, notes: strOrNull(notes) } }); notify.show("Test registrado"); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="TEST DE PARCHE" title="Registrar test" onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save} disabled={busy || product.trim().length < 2}>{busy ? "Guardando..." : "Guardar"}</button></>}>
      <div className="tn-stack">{error && <div className="tn-note tn-note-error" role="alert">{error}</div>}
        <div className="g2-form-grid">
          <Field label="Producto probado" wide><input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Ej.: tintura Igora 6.0" /></Field>
          <Field label="Aplicado el"><input type="date" value={on} onChange={(e) => setOn(e.target.value)} /></Field>
          <Field label="Resultado"><select value={result} onChange={(e) => setResult(e.target.value)}><option value="SIN_LECTURA">Todavía sin lectura</option><option value="NEGATIVO">Negativo (sin reacción)</option><option value="POSITIVO">Positivo (hubo reacción)</option></select></Field>
          <Field label="Notas" wide><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div></div>
    </Modal>
  );
}

function ReadModal({ test, notify, onClose, onDone }: { test: PatchTest; notify: Notify; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState("NEGATIVO");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await appApi(`/patch-tests/${test.id}`, { method: "PUT", body: { result } }); notify.show("Lectura guardada"); onDone(); } catch (e) { notify.fail(e); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="TEST DE PARCHE" title={`Lectura · ${test.product_text}`} onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save} disabled={busy}>Guardar lectura</button></>}>
      <Field label="Resultado"><select value={result} onChange={(e) => setResult(e.target.value)}><option value="NEGATIVO">Negativo (sin reacción)</option><option value="POSITIVO">Positivo (hubo reacción: no aplicar)</option></select></Field>
    </Modal>
  );
}
