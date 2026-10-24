// Modo tatuajes y piercing (Ley 7434 de Mendoza): asistente «Nuevo trabajo» de 4 pasos.
// 1 datos y edad · 2 salud con consentimiento · 3 consentimiento numerado firmado · 4 registro del trabajo con lotes y esterilización.
import { useEffect, useState } from "react";
import { appApi, getSessionUser, shortDate } from "../../config";
import { Field, Loading, Modal, strOrNull } from "../ui";
import { ConsentSignForm, useAppointments, useConsentTemplates } from "./ConsentForms";
import { RecordForm } from "./RecordForms";
import { FlagModal } from "./SaludTab";
import type { ConsentItem, Ficha, RecTemplate } from "./shared";

interface Notify { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }
const STEPS = ["Datos y edad", "Salud", "Consentimiento", "Registro del trabajo"];

export default function TattooWizard({ ficha, reload, notify, onClose }: { ficha: Ficha; reload: () => Promise<void>; notify: Notify; onClose: () => void }) {
  const c = ficha.customer;
  const user = getSessionUser();
  const canEditCustomer = user?.role !== "PROFESIONAL";
  const [step, setStep] = useState(0);
  const [apptId, setApptId] = useState<number | "">("");
  const [consent, setConsent] = useState<ConsentItem | null>(null);
  const [tpls, setTpls] = useState<RecTemplate[] | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [health, setHealth] = useState(false);
  const [care, setCare] = useState(false);
  const [done, setDone] = useState(false);
  const consentTpls = useConsentTemplates();
  const appts = useAppointments(c.id);
  const open = appts.filter((a) => a.status !== "CANCELADO" && a.status !== "NO_SHOW" && a.status !== "FINALIZADO");

  const [birthday, setBirthday] = useState(c.birthday || "");
  const [gName, setGName] = useState(c.guardian_name || "");
  const [gDni, setGDni] = useState(c.guardian_dni_text || "");
  const [gPhone, setGPhone] = useState(c.guardian_phone || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { appApi<RecTemplate[]>("/record-templates?kind=TRABAJO").then(setTpls).catch(() => setTpls([])); }, []);
  useEffect(() => { if (open.length && apptId === "") setApptId(open[0].id); }, [open.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const age = c.age;
  const limit = c.minor_limit;
  const minor = c.is_minor;
  const dataOk = !!c.birthday && (!minor || (!!c.guardian_name && !!c.guardian_dni_text));

  async function saveData() {
    setBusy(true); setError("");
    try {
      await appApi(`/customers/${c.id}`, { method: "PUT", body: { name: c.name, birthday: strOrNull(birthday), guardian_name: strOrNull(gName), guardian_dni_text: strOrNull(gDni), guardian_phone: strOrNull(gPhone) } });
      await reload();
      notify.show("Datos guardados");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }
  async function refreshHealth() { await reload(); setHealth(true); }

  if (!tpls || !consentTpls) return <Modal eyebrow="TATUAJES Y PIERCING" title="Nuevo trabajo" onClose={onClose}><Loading /></Modal>;
  const workTpl = tpls.find((t) => t.active) || null;
  const next = (n: number) => { setError(""); setStep(n); };

  return (
    <Modal eyebrow="TATUAJES Y PIERCING · LEY 7434" title={`Nuevo trabajo · ${c.name}`} size="xl" onClose={onClose}>
      <div className="g2-steps" aria-label="Pasos">{STEPS.map((s, i) => <span key={s} className={step === i ? "is-on" : i < step || done ? "is-done" : ""}>{i + 1}. {s}</span>)}</div>
      {error && <div className="tn-note tn-note-error" role="alert" style={{ marginBottom: 10 }}>{error}</div>}

      {step === 0 && (
        <div className="tn-stack">
          <div className="tn-note tn-note-info">El registro de trabajos pide nombre, domicilio, teléfono, edad y fecha de nacimiento (art. 11). Menores de 21: autorización escrita de padre, madre o tutor (art. 8).</div>
          <dl className="g2-dl"><dt>Cliente</dt><dd>{c.name}{c.dni_text ? ` · DNI ${c.dni_text}` : " · falta el DNI"}</dd><dt>Edad</dt><dd>{age !== null ? `${age} años` : "Falta la fecha de nacimiento"}</dd></dl>
          {canEditCustomer ? (
            <div className="g2-form-grid">
              <Field label="Fecha de nacimiento"><input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} /></Field>
              {(minor || (birthday && new Date().getFullYear() - Number(birthday.slice(0, 4)) <= limit)) && <>
                <Field label="Nombre del padre, madre o tutor"><input value={gName} onChange={(e) => setGName(e.target.value)} /></Field>
                <Field label="DNI del tutor"><input value={gDni} onChange={(e) => setGDni(e.target.value)} /></Field>
                <Field label="Teléfono del tutor"><input value={gPhone} onChange={(e) => setGPhone(e.target.value)} /></Field></>}
              <div style={{ gridColumn: "1 / -1" }}><button className="secondary-button" onClick={saveData} disabled={busy}>{busy ? "Guardando..." : "Guardar datos"}</button></div>
            </div>
          ) : !c.birthday && <div className="tn-note tn-note-warn">Pedile a recepción que cargue la fecha de nacimiento en Clientes.</div>}
          {minor && <div className="tn-note tn-note-warn">Es menor de {limit} años: hace falta que firme el tutor, con su DNI.</div>}
          {open.length > 0 && <Field label="Turno de este trabajo" hint="El consentimiento numerado y el registro quedan vinculados a este turno."><select value={apptId} onChange={(e) => setApptId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Sin turno</option>{open.map((a) => <option key={a.id} value={a.id}>{shortDate(a.date)} · {a.services.join(", ") || "Turno"}</option>)}</select></Field>}
          <div className="tn-row" style={{ justifyContent: "flex-end" }}><button className="primary-button" disabled={!dataOk} onClick={() => next(1)}>Seguir</button></div>
          {!dataOk && <span className="tn-hint" style={{ textAlign: "right" }}>Completá los datos para seguir.</span>}
        </div>)}

      {step === 1 && (
        <div className="tn-stack">
          <div className="tn-note tn-note-info">Enfermedades infectocontagiosas, alergias, adicciones, medicación. Si el cliente padece una enfermedad o adicción, el profesional debe abstenerse (art. 11).</div>
          <div className={`g2-banner ${ficha.health_declared || health ? "is-ok" : "is-warn"}`}><span aria-hidden="true">{ficha.health_declared || health ? "✓" : "!"}</span>
            <div><strong>{ficha.health_declared || health ? "Hay declaración de salud con consentimiento" : "Falta la declaración de salud"}</strong>
              {!(ficha.health_declared || health) && <span style={{ color: "var(--tn-ink)", fontSize: 13.5 }}>Cargá los datos que cuente el cliente o hacele firmar el consentimiento de datos de salud (aunque no tenga nada para declarar).</span>}</div></div>
          {!(ficha.health_declared || health) && <>
            <div className="tn-row"><button className="secondary-button" onClick={() => setFlagging(true)}>Registrar un dato de salud</button></div>
            <strong style={{ fontSize: 14 }}>O firmar la declaración de datos de salud</strong>
            <ConsentSignForm customer={c} tattoo templates={consentTpls} kinds={["DATOS_SALUD"]} appointments={open} defaultApptId={null} notify={notify} onDone={refreshHealth} /></>}
          <div className="tn-row" style={{ justifyContent: "space-between" }}><button className="secondary-button" onClick={() => next(0)}>Volver</button>
            <button className="primary-button" disabled={!(ficha.health_declared || health)} onClick={() => next(2)}>Seguir</button></div>
          {flagging && <FlagModal customerId={c.id} notify={notify} onClose={() => setFlagging(false)} onDone={() => { setFlagging(false); refreshHealth(); }} />}
        </div>)}

      {step === 2 && (
        <div className="tn-stack">
          <div className="tn-note tn-note-info">Consentimiento informado numerado: original para el local y copia para el cliente. Se conserva 5 años y no se borra (Decreto 56/07 art. 6).</div>
          <ConsentSignForm customer={c} tattoo templates={consentTpls} kinds={["TATUAJE", "PIERCING"]} appointments={open} defaultApptId={apptId === "" ? null : apptId} notify={notify} big
            onDone={(k) => { setConsent(k); next(3); reload(); }} />
          <div><button className="secondary-button" onClick={() => next(1)}>Volver</button></div>
        </div>)}

      {step === 3 && !done && (
        !workTpl ? <div className="tn-note tn-note-warn">No hay una plantilla de «Registro de trabajo». Cargá las sugeridas del rubro en Configuración.</div> :
        <RecordForm ficha={ficha} template={workTpl} templates={tpls} consents={consent ? [consent] : []} appointmentId={apptId === "" ? null : apptId} notify={notify}
          onDone={() => { setDone(true); reload(); }} onCancel={() => next(2)} />)}

      {step === 3 && done && (
        <div className="tn-stack">
          <div className="g2-banner is-ok"><span aria-hidden="true">✓</span><div><strong>Trabajo registrado</strong><span style={{ color: "var(--tn-ink)", fontSize: 13.5 }}>Quedó en el registro del local con el consentimiento N.º {consent?.number}. Ahora falta la hoja de cuidados firmada (art. 7: se guarda copia 5 años).</span></div></div>
          {!care ? <ConsentSignForm customer={c} tattoo templates={consentTpls} kinds={["CUIDADOS"]} appointments={open} defaultApptId={apptId === "" ? null : apptId} notify={notify} onDone={() => { setCare(true); reload(); }} />
            : <div className="tn-note tn-note-info">Hoja de cuidados firmada y guardada.</div>}
          <div className="tn-row" style={{ justifyContent: "flex-end" }}><button className="primary-button" onClick={onClose}>{care ? "Listo" : "Cerrar sin hoja de cuidados"}</button></div>
        </div>)}
    </Modal>
  );
}
