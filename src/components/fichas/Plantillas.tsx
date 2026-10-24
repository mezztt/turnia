// Plantillas editables: campos de las fichas y texto de los consentimientos (los sugeridos por rubro se pueden cambiar).
import { useEffect, useState } from "react";
import { appApi } from "../../config";
import { Empty, Field, Loading, Modal, Pill, Seg } from "../ui";
import type { ConsentTpl, FieldDef, RecTemplate } from "./shared";

interface Notify { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }
const KIND_LABEL: Record<string, string> = { FICHA: "Ficha", FORMULA: "Fórmula", TRABAJO: "Registro de trabajo", CUIDADOS: "Cuidados" };
const TYPE_LABEL: Record<string, string> = { texto: "Texto", numero: "Número", opcion: "Opciones", check: "Tilde", fecha: "Fecha", zona: "Zona del cuerpo" };
const CONSENT_KINDS: [string, string][] = [["TATUAJE", "Tatuaje"], ["PIERCING", "Piercing"], ["DEPILACION_LASER", "Depilación láser"], ["ESTETICA_FACIAL", "Estética facial"], ["ESTETICA_CORPORAL", "Estética corporal"],
  ["MASAJE", "Masaje"], ["UNAS", "Uñas"], ["TINTURA", "Tintura"], ["FOTOS_INTERNAS", "Fotos internas"], ["FOTOS_PUBLICAS", "Fotos públicas"], ["CUIDADOS", "Cuidados"], ["DATOS_SALUD", "Datos de salud"]];

export default function Plantillas({ notify }: { notify: Notify }) {
  const [mode, setMode] = useState<"fichas" | "consentimientos">("fichas");
  return (
    <div className="tn-stack">
      <Seg value={mode} onChange={setMode} options={[["fichas", "Fichas"], ["consentimientos", "Consentimientos"]]} />
      {mode === "fichas" ? <RecordTemplates notify={notify} /> : <ConsentTemplates notify={notify} />}
    </div>
  );
}

function RecordTemplates({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<RecTemplate[] | null>(null);
  const [edit, setEdit] = useState<RecTemplate | "new" | null>(null);
  const load = () => appApi<RecTemplate[]>("/record-templates?include_inactive=true").then(setRows).catch(notify.fail);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows) return <Loading />;
  return (
    <div className="tn-card">
      <div className="g2-head"><div><h2>Plantillas de ficha</h2><small>Lo que se anota en cada entrada. Cambiar una plantilla no toca lo ya cargado.</small></div><button className="primary-button" onClick={() => setEdit("new")}>Nueva plantilla</button></div>
      {!rows.length ? <Empty title="No hay plantillas">Cargá las sugeridas del rubro en Configuración o creá una.</Empty> : (
        <div className="g2-list">{rows.map((t) => (
          <div key={t.id} className="g2-row"><div className="g2-row-main"><strong>{t.name}</strong><small>{KIND_LABEL[t.kind]} · {t.fields.length} campos</small></div>
            <div className="g2-row-actions">{!t.active && <Pill tone="gray">Inactiva</Pill>}<button className="secondary-button g2-small-btn" onClick={() => setEdit(t)}>Editar</button></div></div>))}</div>)}
      {edit && <RecordTplModal tpl={edit === "new" ? null : edit} notify={notify} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function RecordTplModal({ tpl, notify, onClose, onDone }: { tpl: RecTemplate | null; notify: Notify; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(tpl?.name || "");
  const [kind, setKind] = useState(tpl?.kind || "FICHA");
  const [active, setActive] = useState(tpl?.active ?? true);
  const [fields, setFields] = useState<(FieldDef & { optText: string })[]>((tpl?.fields || [{ key: "", label: "", type: "texto", required: false, options: [] }]).map((f) => ({ ...f, optText: f.options.join(", ") })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upd = (i: number, patch: Partial<FieldDef & { optText: string }>) => setFields((a) => a.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  async function save() {
    setBusy(true); setError("");
    const body = { name, kind, active, rubro_tag: tpl?.rubro_tag || null, fields: fields.filter((f) => f.label.trim()).map((f) => ({ key: f.key || null, label: f.label, type: f.type, required: f.required, options: f.optText.split(",").map((o) => o.trim()).filter(Boolean) })) };
    try { await appApi(tpl ? `/record-templates/${tpl.id}` : "/record-templates", { method: tpl ? "PUT" : "POST", body }); notify.show("Plantilla guardada"); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="PLANTILLA DE FICHA" title={tpl ? tpl.name : "Nueva plantilla"} size="xl" onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save} disabled={busy || name.trim().length < 2}>{busy ? "Guardando..." : "Guardar"}</button></>}>
      <div className="tn-stack">
        {error && <div className="tn-note tn-note-error" role="alert">{error}</div>}
        <div className="g2-form-grid">
          <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Tipo"><select value={kind} onChange={(e) => setKind(e.target.value as RecTemplate["kind"])}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        </div>
        <label className="g2-check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Plantilla activa</span></label>
        <strong style={{ fontSize: 14 }}>Campos</strong>
        {fields.map((f, i) => (
          <div key={i} className="g2-field-row">
            <input value={f.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="Nombre del campo" aria-label="Nombre del campo" />
            <select value={f.type} onChange={(e) => upd(i, { type: e.target.value as FieldDef["type"] })} aria-label="Tipo de campo">{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <label className="g2-check" style={{ alignItems: "center" }}><input type="checkbox" checked={f.required} onChange={(e) => upd(i, { required: e.target.checked })} /><span>Obligatorio</span></label>
            <input value={f.optText} disabled={f.type !== "opcion"} onChange={(e) => upd(i, { optText: e.target.value })} placeholder={f.type === "opcion" ? "Opciones separadas por coma" : "—"} aria-label="Opciones" />
            <button type="button" className="tn-link tn-link-danger" onClick={() => setFields((a) => a.filter((_, j) => j !== i))}>Quitar</button>
          </div>))}
        <div><button type="button" className="secondary-button g2-small-btn" onClick={() => setFields((a) => [...a, { key: "", label: "", type: "texto", required: false, options: [], optText: "" }])}>+ Agregar campo</button></div>
      </div>
    </Modal>
  );
}

function ConsentTemplates({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<ConsentTpl[] | null>(null);
  const [edit, setEdit] = useState<ConsentTpl | "new" | null>(null);
  const load = () => appApi<ConsentTpl[]>("/consent-templates?include_inactive=true").then(setRows).catch(notify.fail);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows) return <Loading />;
  return (
    <div className="tn-card">
      <div className="g2-head"><div><h2>Textos de consentimiento</h2><small>Son textos sugeridos, no asesoramiento legal: que los revise un profesional. Al cambiar el texto sube la versión; lo ya firmado conserva el texto que se firmó.</small></div><button className="primary-button" onClick={() => setEdit("new")}>Nuevo texto</button></div>
      {!rows.length ? <Empty title="No hay textos">Cargá los sugeridos del rubro en Configuración.</Empty> : (
        <div className="g2-list">{rows.map((t) => (
          <div key={t.id} className="g2-row"><div className="g2-row-main"><strong>{t.title}</strong><small>Versión {t.version}{t.numbered ? " · numerado" : ""}{t.requires_guardian_if_under_age ? ` · tutor si es menor de ${t.requires_guardian_if_under_age}` : ""}</small></div>
            <div className="g2-row-actions">{!t.active && <Pill tone="gray">Inactivo</Pill>}<button className="secondary-button g2-small-btn" onClick={() => setEdit(t)}>Editar</button></div></div>))}</div>)}
      {edit && <ConsentTplModal tpl={edit === "new" ? null : edit} notify={notify} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function ConsentTplModal({ tpl, notify, onClose, onDone }: { tpl: ConsentTpl | null; notify: Notify; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState(tpl?.kind || "DATOS_SALUD");
  const [title, setTitle] = useState(tpl?.title || "");
  const [body, setBody] = useState(tpl?.body || "Yo, {nombre}, declaro que …");
  const [age, setAge] = useState(tpl?.requires_guardian_if_under_age ? String(tpl.requires_guardian_if_under_age) : "");
  const [numbered, setNumbered] = useState(tpl?.numbered ?? false);
  const [active, setActive] = useState(tpl?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try { await appApi(tpl ? `/consent-templates/${tpl.id}` : "/consent-templates", { method: tpl ? "PUT" : "POST", body: { kind, title, body, numbered, active, requires_guardian_if_under_age: age ? Number(age) : null } }); notify.show("Texto guardado"); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="CONSENTIMIENTO" title={tpl ? tpl.title : "Nuevo texto"} size="wide" onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save} disabled={busy}>{busy ? "Guardando..." : "Guardar"}</button></>}>
      <div className="tn-stack">
        {error && <div className="tn-note tn-note-error" role="alert">{error}</div>}
        <div className="g2-form-grid">
          {!tpl && <Field label="Tipo"><select value={kind} onChange={(e) => setKind(e.target.value)}>{CONSENT_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>}
          <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Pedir tutor si es menor de" hint="Vacío = según el rubro (18, o 21 en tatuajes)"><select value={age} onChange={(e) => setAge(e.target.value)}><option value="">Según el rubro</option><option value="18">18 años</option><option value="21">21 años</option></select></Field>
        </div>
        <Field label="Texto" hint="{nombre} se reemplaza por quien firma."><textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <label className="g2-check"><input type="checkbox" checked={numbered} onChange={(e) => setNumbered(e.target.checked)} /><span>Numerado (correlativo, se conserva 5 años)</span></label>
        <label className="g2-check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Activo</span></label>
      </div>
    </Modal>
  );
}
