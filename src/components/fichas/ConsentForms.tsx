// Consentimientos: firma en tablet o en papel, lista, impresión, revocación y escaneo del formulario oficial.
import { useEffect, useMemo, useState } from "react";
import { appApi, appBlob, appUpload, dateTime, saveBlob, shortDate } from "../../config";
import { Empty, Field, Loading, Modal, Pill, strOrNull } from "../ui";
import { ConfirmModal } from "../r1/common";
import { printConsent } from "../../pages/print/g2print";
import type { ConsentPrintData } from "../../pages/print/g2print";
import { SignaturePad } from "./shared";
import type { ConsentItem, ConsentTpl, Ficha } from "./shared";

interface Notify { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }
interface ApptLite { id: number; date: string; status: string; services: string[] }

/** Formulario de firma. Sirve dentro de un modal y dentro del asistente de tatuajes. */
export function ConsentSignForm({ customer, templates, kinds, appointments, defaultApptId, onDone, onCancel, notify, big }: {
  customer: Ficha["customer"]; tattoo: boolean; templates: ConsentTpl[]; kinds?: string[]; appointments: ApptLite[]; defaultApptId?: number | null;
  onDone: (c: ConsentItem) => void; onCancel?: () => void; notify: Notify; big?: boolean;
}) {
  const list = useMemo(() => templates.filter((t) => t.active && (!kinds || kinds.includes(t.kind))), [templates, kinds]);
  const [tplId, setTplId] = useState<number | "">(list[0]?.id ?? "");
  const tpl = list.find((t) => t.id === tplId) || null;
  const limit = Math.max(tpl?.requires_guardian_if_under_age || 0, customer.minor_limit);
  const needsGuardian = customer.age !== null && customer.age < limit;
  const [guardian, setGuardian] = useState(needsGuardian);
  const [name, setName] = useState(needsGuardian ? customer.guardian_name || "" : customer.name);
  const [dni, setDni] = useState((needsGuardian ? customer.guardian_dni_text : customer.dni_text) || "");
  const [relation, setRelation] = useState("");
  const [paper, setPaper] = useState(false);
  const [formNo, setFormNo] = useState("");
  const [sig, setSig] = useState<string | null>(null);
  const [apptId, setApptId] = useState<number | "">(defaultApptId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tpl) return;
    const g = needsGuardian;
    setGuardian(g);
    setName(g ? customer.guardian_name || "" : customer.name);
    setDni((g ? customer.guardian_dni_text : customer.dni_text) || "");
  }, [tplId]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = tpl ? tpl.body.replace(/\{nombre\}/g, guardian ? `${name || "…"}, ${(relation || "tutor").toLowerCase()} de ${customer.name}` : customer.name) : "";
  const openAppts = appointments.filter((a) => a.status !== "CANCELADO" && a.status !== "NO_SHOW");

  async function save() {
    if (!tpl) return;
    setError("");
    if (!paper && !sig) { setError("Falta la firma: dibujala en la pantalla o marcá «Firmado en papel»."); return; }
    setBusy(true);
    try {
      const c = await appApi<ConsentItem>("/consents", { method: "POST", body: {
        customer_id: customer.id, template_id: tpl.id, appointment_id: apptId || null, signer_name: name, signer_dni_text: strOrNull(dni),
        signer_is_guardian: guardian, guardian_relation: strOrNull(relation), signature_png: paper ? null : sig, paper_signed: paper, official_form_number: strOrNull(formNo) } });
      notify.show(c.number ? `Consentimiento N.º ${c.number} guardado` : "Consentimiento guardado");
      onDone(c);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }

  if (!list.length) return <Empty title="No hay plantillas de consentimiento">Cargá las sugeridas del rubro en Configuración o creá una en Fichas → Plantillas.</Empty>;
  return (
    <div className="tn-stack">
      {error && <div className="tn-note tn-note-error" role="alert">{error}</div>}
      <Field label="Qué se firma"><select value={tplId} onChange={(e) => setTplId(Number(e.target.value))}>{list.map((t) => <option key={t.id} value={t.id}>{t.title}{t.numbered ? " (numerado)" : ""}</option>)}</select></Field>
      {tpl?.numbered && <div className="tn-note tn-note-info">Este consentimiento lleva número correlativo, se guarda 5 años y no se puede borrar ni revocar (Ley 7434 y Decreto 56/07).</div>}
      {needsGuardian && <div className="tn-note tn-note-warn">{customer.name} es menor de {limit} años: firma el padre, madre o tutor, con su DNI.</div>}
      <div className="g2-body-text" tabIndex={0} aria-label="Texto del consentimiento">{body}</div>
      <label className="g2-check"><input type="checkbox" checked={guardian} disabled={needsGuardian} onChange={(e) => setGuardian(e.target.checked)} /><span>Firma un tutor (padre, madre o representante)</span></label>
      <div className="g2-form-grid">
        <Field label="Nombre de quien firma"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="DNI de quien firma"><input value={dni} onChange={(e) => setDni(e.target.value)} inputMode="numeric" /></Field>
        {guardian && <Field label="Vínculo con el cliente" hint="Madre, padre, tutor…"><input value={relation} onChange={(e) => setRelation(e.target.value)} /></Field>}
        {openAppts.length > 0 && (
          <Field label="Turno de este trabajo" hint={tpl?.numbered ? "Se firma un consentimiento nuevo por trabajo." : "Opcional"}>
            <select value={apptId} onChange={(e) => setApptId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Sin vincular</option>{openAppts.map((a) => <option key={a.id} value={a.id}>{shortDate(a.date)} · {a.services.join(", ") || "Turno"}</option>)}
            </select>
          </Field>)}
      </div>
      <label className="g2-check"><input type="checkbox" checked={paper} onChange={(e) => setPaper(e.target.checked)} /><span>Firmado en papel (se archiva el original)</span></label>
      {paper ? (
        <Field label={tpl?.numbered ? "N.º del formulario oficial del Ministerio" : "N.º del formulario (opcional)"} hint="Un formulario firmado en la tablet no reemplaza al oficial: tomalo como respaldo."><input value={formNo} onChange={(e) => setFormNo(e.target.value)} /></Field>
      ) : <SignaturePad big={big} onChange={setSig} />}
      <div className="tn-row" style={{ justifyContent: "flex-end" }}>
        {onCancel && <button className="secondary-button" onClick={onCancel} disabled={busy}>Cancelar</button>}
        <button className="primary-button" onClick={save} disabled={busy || !tpl}>{busy ? "Guardando..." : "Guardar consentimiento"}</button>
      </div>
    </div>
  );
}

export function ConsentSignModal(props: Parameters<typeof ConsentSignForm>[0] & { onClose: () => void }) {
  return <Modal eyebrow="FIRMAR" title="Consentimiento" size="xl" onClose={props.onClose}><ConsentSignForm {...props} onCancel={props.onClose} big /></Modal>;
}

export function useConsentTemplates() {
  const [tpls, setTpls] = useState<ConsentTpl[] | null>(null);
  useEffect(() => { appApi<ConsentTpl[]>("/consent-templates").then(setTpls).catch(() => setTpls([])); }, []);
  return tpls;
}

export function useAppointments(customerId: number): ApptLite[] {
  const [rows, setRows] = useState<ApptLite[]>([]);
  useEffect(() => { appApi<{ appointments?: ApptLite[] }>(`/customers/${customerId}`).then((c) => setRows(c.appointments || [])).catch(() => setRows([])); }, [customerId]);
  return rows;
}

export function ConsentsTab({ ficha, notify, onChanged }: { ficha: Ficha; notify: Notify; onChanged: () => void }) {
  const cid = ficha.customer.id;
  const [rows, setRows] = useState<ConsentItem[] | null>(null);
  const [signing, setSigning] = useState(false);
  const [revoke, setRevoke] = useState<ConsentItem | null>(null);
  const [scanFor, setScanFor] = useState<ConsentItem | null>(null);
  const [askPrint, setAskPrint] = useState<ConsentItem | null>(null);
  const tpls = useConsentTemplates();
  const appts = useAppointments(cid);
  const load = () => appApi<ConsentItem[]>(`/customers/${cid}/consents`).then(setRows).catch(notify.fail);
  useEffect(() => { load(); }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function print(c: ConsentItem) {
    try { printConsent(await appApi<ConsentPrintData>(`/consents/${c.id}/print`)); } catch (e) { notify.fail(e); }
  }
  async function openScan(c: ConsentItem) {
    try { const b = await appBlob(`/consents/${c.id}/official-scan`); saveBlob(b, `formulario-oficial-${c.number ?? c.id}`); } catch (e) { notify.fail(e); }
  }
  async function doRevoke() {
    if (!revoke) return;
    try { const r = await appApi<{ detail: string }>(`/consents/${revoke.id}/revoke`, { method: "POST", body: {} }); notify.show(r.detail); setRevoke(null); load(); onChanged(); } catch (e) { notify.fail(e); }
  }
  if (!rows || !tpls) return <Loading />;
  const revocable = (c: ConsentItem) => ["FOTOS_PUBLICAS", "FOTOS_INTERNAS", "DATOS_SALUD"].includes(c.kind) && !c.revoked_at && !c.locked_until;
  return (
    <div className="tn-stack" data-tour="ficha-consent">
      <div className="g2-head"><div><h2>Consentimientos</h2><small>Firmados en la tablet o en papel. Cada firma guarda el texto exacto que se firmó.</small></div>
        <button className="primary-button" onClick={() => setSigning(true)}>Firmar consentimiento</button></div>
      {!rows.length ? <Empty title="Todavía no firmó nada">Tocá «Firmar consentimiento» y dejale la tablet al cliente.</Empty> : (
        <div className="g2-list">
          {rows.map((c) => (
            <div key={c.id} className="g2-row">
              <div className="g2-row-main">
                <strong>{c.number ? `N.º ${c.number} · ` : ""}{c.title}</strong>
                <small>Firmó {c.signer_name}{c.signer_is_guardian ? ` (${c.guardian_relation || "tutor"})` : ""} · {dateTime(c.signed_at)} · {c.signed_on_paper ? "en papel" : "en pantalla"}{c.official_form_number ? ` · formulario ${c.official_form_number}` : ""}</small>
                <div className="tn-prod-badges">
                  {c.revoked_at ? <Pill tone="red">Revocado el {shortDate(c.revoked_at)}</Pill> : c.valid ? <Pill tone="green">Vigente</Pill> : <Pill tone="orange">Vencido</Pill>}
                  {c.locked_until && <Pill tone="violet">Se conserva hasta {shortDate(c.locked_until)}</Pill>}
                  {c.appointment_id && <Pill tone="gray">Vinculado a un turno</Pill>}
                </div>
              </div>
              <div className="g2-row-actions">
                <button className="secondary-button g2-small-btn" onClick={() => print(c)}>Imprimir</button>
                {c.has_scan ? <button className="secondary-button g2-small-btn" onClick={() => openScan(c)}>Ver formulario</button>
                  : c.official_form_number !== null || c.signed_on_paper ? <button className="secondary-button g2-small-btn" onClick={() => setScanFor(c)}>Adjuntar escaneo</button> : null}
                {revocable(c) && <button className="tn-danger-button g2-small-btn" onClick={() => setRevoke(c)}>Revocar</button>}
              </div>
            </div>))}
        </div>)}
      {signing && <ConsentSignModal customer={ficha.customer} tattoo={ficha.tattoo_mode} templates={tpls} appointments={appts} notify={notify} onClose={() => setSigning(false)}
        onDone={(c) => { setSigning(false); load(); onChanged(); setAskPrint(c); }} />}
      {askPrint && <ConfirmModal title="Consentimiento guardado" confirmLabel="Imprimir" onConfirm={() => { print(askPrint); setAskPrint(null); }} onClose={() => setAskPrint(null)}>¿Querés imprimir ahora el original y la copia para el cliente?</ConfirmModal>}
      {revoke && <ConfirmModal title="Revocar consentimiento" danger confirmLabel="Revocar" onConfirm={doRevoke} onClose={() => setRevoke(null)}>
        {revoke.kind === "FOTOS_PUBLICAS" || revoke.kind === "FOTOS_INTERNAS" ? "Todas las fotos de este cliente dejan de ser públicas ahora mismo." : "Los datos de salud se dan de baja salvo que la ley obligue a conservarlos."} ¿Seguro?
      </ConfirmModal>}
      {scanFor && <ScanModal consent={scanFor} notify={notify} onClose={() => setScanFor(null)} onDone={() => { setScanFor(null); load(); }} />}
    </div>
  );
}

function ScanModal({ consent, notify, onClose, onDone }: { consent: ConsentItem; notify: Notify; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!file) return;
    setBusy(true);
    try { const f = new FormData(); f.append("file", file); await appUpload(`/consents/${consent.id}/official-scan`, f); notify.show("Escaneo adjunto"); onDone(); } catch (e) { notify.fail(e); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="FORMULARIO OFICIAL" title="Adjuntar escaneo" onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={go} disabled={!file || busy}>{busy ? "Subiendo..." : "Adjuntar"}</button></>}>
      <Field label="Foto o PDF del formulario firmado" hint="Se puede adjuntar una sola vez."><input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
    </Modal>
  );
}
