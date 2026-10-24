import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { appApi, canAccess, cap, dateTime, getSessionUser, OPENING_DAYS, publicLinks, USER_KEY } from "../../config";
import type { SessionUser, Vocabulary } from "../../config";
import { BajaServicioCard } from "../../components/BajaServicio";
import { startTour } from "../../components/tour/Tour";
import VenueDocs from "../../components/configuracion/VenueDocs";
import { ConfirmModal, EmptyAction } from "../../components/r1/common";
import { Field, Loading, Modal, PageHeader, Pill, Switch, Tabs, numOrNull, strOrNull, useFlash } from "../../components/ui";

interface Company { name: string; slug: string | null; rubro: string | null; cuit: string | null; email: string | null; phone: string | null; address: string | null; city: string | null }
interface Settings {
  address: string | null; phone: string | null; whatsapp_phone: string | null; instagram: string | null; email: string | null; google_review_url: string | null;
  opening_hours: Record<string, string[][]>;
  rubro: string | null; extra_rubros: string[]; vocabulary: Partial<Vocabulary>; tattoo_mode: boolean; laser_mode: boolean;
  slot_minutes: number; booking_min_notice_min: number; booking_max_days: number; hold_minutes: number; allow_professional_choice_web: boolean;
  no_show_grace_min: number; professional_sees_others: boolean; professional_can_collect: boolean;
  cancel_free_hours: number; cancel_policy_text: string | null; deposit_default_mode: string; deposit_default_value: number;
  cancel_on_time_deposit: string; noshow_threshold: number; noshow_requires_deposit: boolean; arrepentimiento_devuelve_sena: boolean;
  mp_access_token: string; mp_configured: boolean; mp_public_key: string | null;
  ticket_footer: string | null; complaints_book_reminder: boolean;
}
interface Preset { rubro: string; label: string; vocabulary: Vocabulary; services: number; records: number; consents: number; tattoo_mode: boolean; suggested_modules: string[] }
interface Template { id: number; kind: string; name: string; body: string; active: boolean }
interface DistanceReq { id: number; kind: string; kind_label: string; code: string; subject_type: string; name: string; contact: string; detail: string | null; status: string; requested_at: string; resolution_note: string | null; hours_left: number | null; overdue: boolean }

type Tab = "rubro" | "local" | "sena" | "mensajes" | "mp" | "venc" | "bajas" | "ayuda";

const VOCAB_FIELDS: [keyof Vocabulary, string][] = [
  ["profesional", "Profesional (singular)"], ["profesionales", "Profesionales (plural)"], ["turno", "Turno (singular)"],
  ["turnos", "Turnos (plural)"], ["puesto", "Puesto de trabajo (singular)"], ["puestos", "Puestos de trabajo (plural)"],
];
const DEPOSIT_MODES: [string, string][] = [["NINGUNA", "Sin seña"], ["FIJA", "Importe fijo ($)"], ["PORCENTAJE", "Porcentaje del turno (%)"]];
const KIND_LABEL: Record<string, string> = {
  CONFIRMACION: "Confirmación", RECORDATORIO: "Recordatorio", CUMPLE: "Cumpleaños", REACTIVACION: "Te extrañamos", RESENA: "Pedir reseña",
  ESPERA: "Lista de espera", SENIA: "Seña pendiente", PACK_VENCE: "Pack por vencer", CUSTOM: "Otro",
};

/** "12:00-15:00, 20:00-00:00" <-> [["12:00","15:00"],["20:00","00:00"]] */
const hoursToText = (v: string[][] | undefined) => (v || []).map(([a, b]) => `${a}-${b}`).join(", ");
function textToHours(t: string): string[][] {
  return t.split(",").map((x) => x.trim()).filter(Boolean).map((x) => x.split("-").map((y) => y.trim())).filter((p) => p.length === 2 && /^\d{1,2}:\d{2}$/.test(p[0]) && /^\d{1,2}:\d{2}$/.test(p[1]))
    .map(([a, b]) => [a.padStart(5, "0"), b.padStart(5, "0")]);
}

function Configuracion() {
  const user = getSessionUser();
  const location = useLocation();
  const { show, fail, node: flash } = useFlash();
  const [tab, setTab] = useState<Tab>(() => ((location.state as { tab?: Tab } | null)?.tab) || "rubro");
  const [company, setCompany] = useState<Company | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [hoursText, setHoursText] = useState<Record<string, string>>({});
  const [mpToken, setMpToken] = useState("");
  const [requests, setRequests] = useState<DistanceReq[]>([]);
  const [resolving, setResolving] = useState<DistanceReq | null>(null);
  const [confirmPreset, setConfirmPreset] = useState(false);
  const [busy, setBusy] = useState(false);

  const applySettings = useCallback((d: Settings) => {
    setS(d);
    setHoursText(Object.fromEntries(OPENING_DAYS.map(([k]) => [k, hoursToText(d.opening_hours?.[k])])));
  }, []);
  const loadRequests = useCallback(() => { appApi<DistanceReq[]>("/distance-requests").then(setRequests).catch(() => {}); }, []);

  useEffect(() => {
    appApi<Company>("/company").then(setCompany).catch(fail);
    appApi<Settings>("/company/settings").then(applySettings).catch(fail);
    appApi<Preset[]>("/company/presets").then(setPresets).catch(() => {});
    loadRequests();
  }, [applySettings, fail, loadRequests]);

  /** Mantiene la sesión al día (vocabulario, rubro, modos) después de guardar */
  async function refreshSession() {
    try { const me = await appApi<SessionUser>("/auth/me"); localStorage.setItem(USER_KEY, JSON.stringify(me)); } catch { /* sin conexión: queda como estaba */ }
  }
  async function saveCompany() {
    if (!company) return;
    try {
      setCompany(await appApi<Company>("/company", { method: "PUT", body: {
        name: company.name, cuit: strOrNull(company.cuit), email: strOrNull(company.email),
        phone: strOrNull(company.phone), address: strOrNull(company.address), city: strOrNull(company.city),
      } }));
      show("Datos guardados");
    } catch (e) { fail(e); }
  }
  async function saveSettings(patch: Record<string, unknown>, message = "Configuración guardada") {
    try { applySettings(await appApi<Settings>("/company/settings", { method: "PUT", body: patch })); await refreshSession(); show(message); }
    catch (e) { fail(e); }
  }
  async function applyPreset() {
    setBusy(true);
    try {
      const r = await appApi<{ added: Record<string, number>; detail: string }>("/company/apply-preset", { method: "POST", body: {} });
      const a = r.added;
      show(`Cargado: ${a.services} servicios, ${a.records} fichas, ${a.consents} consentimientos y ${a.messages} mensajes. ${r.detail}`);
      setConfirmPreset(false);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (!company || !s) return <Loading />;
  const setC = (k: keyof Company, v: string) => setCompany({ ...company, [k]: v });
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const preset = presets.find((p) => p.rubro === s.rubro);
  const voc: Vocabulary = { ...(preset?.vocabulary || { profesional: "profesional", profesionales: "profesionales", turno: "turno", turnos: "turnos", puesto: "puesto", puestos: "puestos" }), ...s.vocabulary };
  const links = publicLinks(company.slug);
  const webs: [string, string, string][] = [["web_turnos", "Turnos online", links.turnos], ["web_vitrina", "Vitrina del local", links.vitrina]];
  const open = requests.filter((r) => r.status === "RECIBIDA");

  return (
    <section className="products-page">
      <PageHeader eyebrow="CONFIGURACIÓN" title="Configuración" subtitle="Rubro, datos del local, política de seña, mensajes, Mercado Pago y ayuda." />
      <div data-tour="config-tabs">
        <Tabs<Tab> value={tab} onChange={setTab} options={[
          ["rubro", "Rubro y vocabulario"], ["local", "Local y horarios"], ["sena", "Agenda y seña"], ["mensajes", "Mensajes"],
          ["mp", "Mercado Pago"], ["venc", "Vencimientos"], ["bajas", open.length ? `Baja y arrepentimiento (${open.length})` : "Baja y arrepentimiento"], ["ayuda", "Ayuda"],
        ]} />
      </div>

      {tab === "rubro" && (
        <div className="tn-grid-2">
          <div className="tn-card" data-tour="config-rubro">
            <h2>Tu rubro</h2>
            <p className="tn-muted">Define cómo se llaman las cosas en pantalla y qué servicios, fichas y consentimientos te sugerimos. Cambiarlo no borra nada.</p>
            <div className="product-form">
              <Field label="Rubro principal">
                <select value={s.rubro || ""} onChange={(e) => set("rubro", e.target.value)}>
                  {presets.map((p) => <option key={p.rubro} value={p.rubro}>{p.label}</option>)}
                </select>
              </Field>
              <Switch on={s.tattoo_mode} onChange={(v) => set("tattoo_mode", v)} label="Modo tatuajes y piercing"
                hint="Consentimiento numerado conservado 5 años, mayoría de edad en 21 años y autorización de menores (Ley 7434, Decreto 56/07). No se puede anonimizar a quien tenga consentimientos vigentes." />
              <Switch on={s.laser_mode} onChange={(v) => set("laser_mode", v)} label="Modo láser / equipos con registro" hint="Activalo si usás equipos que exigen registro de sesión y mantenimiento." />
              <button className="primary-button" style={{ alignSelf: "flex-start" }} onClick={() => saveSettings({ rubro: s.rubro, tattoo_mode: s.tattoo_mode, laser_mode: s.laser_mode }, "Rubro guardado")}>Guardar rubro</button>
            </div>
          </div>
          <div className="tn-card">
            <h2>Servicios y fichas sugeridas</h2>
            {preset ? (<>
              <p className="tn-muted">Para {preset.label.toLowerCase()} te cargamos {preset.services} servicios con sus tiempos, {preset.records} fichas, {preset.consents} consentimientos y los mensajes de WhatsApp. Solo agrega: nunca borra ni pisa lo tuyo. Los precios vienen en $0 para que los completes.</p>
              <button className="primary-button" onClick={() => setConfirmPreset(true)}>Cargar servicios y fichas sugeridas</button>
            </>) : <EmptyAction title="Elegí un rubro" text="Guardá tu rubro y vas a poder cargar lo sugerido." />}
          </div>
          <div className="tn-card" style={{ gridColumn: "1 / -1" }}>
            <h2>Vocabulario</h2>
            <p className="tn-muted">Así se llama cada cosa en tu sistema. Ejemplo: «{cap(voc.turnos)} de hoy con {voc.profesional}». Dejalo vacío para usar el del rubro.</p>
            <div className="tn-grid-form">
              {VOCAB_FIELDS.map(([k, label]) => (
                <Field key={k} label={label}><input value={s.vocabulary[k] ?? ""} placeholder={voc[k]} onChange={(e) => set("vocabulary", { ...s.vocabulary, [k]: e.target.value })} /></Field>
              ))}
            </div>
            <button className="primary-button" style={{ marginTop: 12 }}
              onClick={() => saveSettings({ vocabulary: Object.fromEntries(Object.entries(s.vocabulary).filter(([, v]) => (v || "").trim())) }, "Vocabulario guardado")}>Guardar vocabulario</button>
          </div>
        </div>
      )}

      {tab === "local" && (
        <div className="tn-grid-2">
          <div className="tn-card">
            <h2>Datos del local</h2>
            <p className="tn-muted">Salen en los mensajes, los comprobantes internos y las páginas públicas.</p>
            <div className="product-form">
              <Field label="Nombre"><input value={company.name} onChange={(e) => setC("name", e.target.value)} /></Field>
              <div className="form-row">
                <Field label="CUIT"><input value={company.cuit || ""} onChange={(e) => setC("cuit", e.target.value)} /></Field>
                <Field label="Teléfono"><input value={company.phone || ""} onChange={(e) => setC("phone", e.target.value)} /></Field>
              </div>
              <div className="form-row">
                <Field label="Email"><input value={company.email || ""} onChange={(e) => setC("email", e.target.value)} /></Field>
                <Field label="Localidad"><input value={company.city || ""} onChange={(e) => setC("city", e.target.value)} /></Field>
              </div>
              <Field label="Dirección"><input value={company.address || ""} onChange={(e) => setC("address", e.target.value)} /></Field>
              <button className="primary-button" onClick={saveCompany} style={{ alignSelf: "flex-start" }}>Guardar datos</button>
              <hr className="tn-hr" />
              <Field label="WhatsApp del local" hint="Con código de área, sin 0 ni 15. Lo usan los botones de wa.me; no se envía nada automático."><input value={s.whatsapp_phone || ""} onChange={(e) => set("whatsapp_phone", e.target.value)} /></Field>
              <div className="form-row">
                <Field label="Instagram"><input value={s.instagram || ""} onChange={(e) => set("instagram", e.target.value)} placeholder="@tulocal" /></Field>
                <Field label="Link para reseñas de Google (opcional)"><input value={s.google_review_url || ""} onChange={(e) => set("google_review_url", e.target.value)} /></Field>
              </div>
              <button className="primary-button" style={{ alignSelf: "flex-start" }}
                onClick={() => saveSettings({ whatsapp_phone: s.whatsapp_phone ?? "", instagram: s.instagram ?? "", google_review_url: s.google_review_url ?? "" }, "Contacto guardado")}>Guardar contacto</button>
            </div>
          </div>
          <div className="tn-card">
            <h2>Horarios de atención</h2>
            <p className="tn-muted">Por día, uno o más tramos separados por coma. Ejemplo: 09:00-13:00, 15:00-20:00. Vacío = cerrado. El horario de cada {voc.profesional} se carga en Servicios y equipo.</p>
            <div className="product-form">
              {OPENING_DAYS.map(([k, label]) => (
                <Field key={k} label={label}><input value={hoursText[k] || ""} placeholder="Cerrado" onChange={(e) => setHoursText({ ...hoursText, [k]: e.target.value })} /></Field>
              ))}
              <button className="primary-button" style={{ alignSelf: "flex-start" }}
                onClick={() => saveSettings({ opening_hours: Object.fromEntries(OPENING_DAYS.map(([k]) => [k, textToHours(hoursText[k] || "")] as [string, string[][]]).filter(([, v]) => v.length)) }, "Horarios guardados")}>Guardar horarios</button>
            </div>
          </div>
        </div>
      )}

      {tab === "sena" && (
        <div className="tn-grid-2">
          <div className="tn-card">
            <h2>Seña y cancelación</h2>
            <p className="tn-muted">La política se muestra al cliente antes de reservar y queda copiada en cada {voc.turno}. Cada servicio puede tener su propia seña.</p>
            <div className="product-form">
              <Field label="Seña por defecto">
                <select value={s.deposit_default_mode} onChange={(e) => set("deposit_default_mode", e.target.value)}>{DEPOSIT_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </Field>
              {s.deposit_default_mode !== "NINGUNA" && <Field label={s.deposit_default_mode === "FIJA" ? "Importe ($)" : "Porcentaje (%)"}><input inputMode="decimal" value={s.deposit_default_value} onChange={(e) => set("deposit_default_value", numOrNull(e.target.value) ?? 0)} /></Field>}
              <Field label="Cancelación sin costo hasta (horas antes)"><input inputMode="numeric" value={s.cancel_free_hours} onChange={(e) => set("cancel_free_hours", numOrNull(e.target.value) ?? 0)} /></Field>
              <Field label="Si cancela a tiempo, la seña…">
                <select value={s.cancel_on_time_deposit} onChange={(e) => set("cancel_on_time_deposit", e.target.value)}>
                  <option value="A_FAVOR">Queda a favor del cliente</option><option value="DEVUELTA">Se devuelve</option>
                </select>
              </Field>
              <Switch on={s.arrepentimiento_devuelve_sena} onChange={(v) => set("arrepentimiento_devuelve_sena", v)} label="Devolver la seña ante un arrepentimiento" hint="Recomendado: la Disposición 954/2025 prevé el arrepentimiento en contrataciones a distancia." />
              <Field label="Texto de la política (lo ve el cliente)"><textarea rows={3} value={s.cancel_policy_text || ""} onChange={(e) => set("cancel_policy_text", e.target.value)} /></Field>
              <div className="form-row">
                <Field label="Ausencias para pedir seña"><input inputMode="numeric" value={s.noshow_threshold} onChange={(e) => set("noshow_threshold", numOrNull(e.target.value) ?? 2)} /></Field>
                <Switch on={s.noshow_requires_deposit} onChange={(v) => set("noshow_requires_deposit", v)} label="Exigir seña a quien faltó" />
              </div>
            </div>
          </div>
          <div className="tn-card">
            <h2>Agenda</h2>
            <div className="product-form">
              <div className="form-row">
                <Field label="Paso de la agenda (min)"><input inputMode="numeric" value={s.slot_minutes} onChange={(e) => set("slot_minutes", numOrNull(e.target.value) ?? 15)} /></Field>
                <Field label="Gracia para marcar ausente (min)"><input inputMode="numeric" value={s.no_show_grace_min} onChange={(e) => set("no_show_grace_min", numOrNull(e.target.value) ?? 15)} /></Field>
              </div>
              <div className="form-row">
                <Field label="Aviso mínimo para reservar online (min)"><input inputMode="numeric" value={s.booking_min_notice_min} onChange={(e) => set("booking_min_notice_min", numOrNull(e.target.value) ?? 0)} /></Field>
                <Field label="Hasta cuántos días adelante"><input inputMode="numeric" value={s.booking_max_days} onChange={(e) => set("booking_max_days", numOrNull(e.target.value) ?? 60)} /></Field>
              </div>
              <Field label="Reserva de lugar mientras se paga la seña (min)"><input inputMode="numeric" value={s.hold_minutes} onChange={(e) => set("hold_minutes", numOrNull(e.target.value) ?? 15)} /></Field>
              <Switch on={s.allow_professional_choice_web} onChange={(v) => set("allow_professional_choice_web", v)} label={`Dejar elegir ${voc.profesional} en la web`} />
              <Switch on={s.professional_sees_others} onChange={(v) => set("professional_sees_others", v)} label={`Cada ${voc.profesional} ve la agenda de los demás (solo lectura)`} />
              <Switch on={s.professional_can_collect} onChange={(v) => set("professional_can_collect", v)} label={`Cada ${voc.profesional} puede cobrar`} />
              <Field label="Mensaje al pie de los comprobantes" hint="Siempre dicen «Documento no válido como factura»."><input value={s.ticket_footer || ""} onChange={(e) => set("ticket_footer", e.target.value)} /></Field>
              <Switch on={s.complaints_book_reminder} onChange={(v) => set("complaints_book_reminder", v)} label="Recordarme el libro de quejas" hint="Aviso opcional: el libro lo rubrica Defensa del Consumidor o el municipio." />
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button className="primary-button" onClick={() => saveSettings({
              deposit_default_mode: s.deposit_default_mode, deposit_default_value: s.deposit_default_value, cancel_free_hours: s.cancel_free_hours,
              cancel_on_time_deposit: s.cancel_on_time_deposit, arrepentimiento_devuelve_sena: s.arrepentimiento_devuelve_sena, cancel_policy_text: s.cancel_policy_text ?? "",
              noshow_threshold: s.noshow_threshold, noshow_requires_deposit: s.noshow_requires_deposit, slot_minutes: s.slot_minutes, no_show_grace_min: s.no_show_grace_min,
              booking_min_notice_min: s.booking_min_notice_min, booking_max_days: s.booking_max_days, hold_minutes: s.hold_minutes,
              allow_professional_choice_web: s.allow_professional_choice_web, professional_sees_others: s.professional_sees_others,
              professional_can_collect: s.professional_can_collect, ticket_footer: s.ticket_footer ?? "", complaints_book_reminder: s.complaints_book_reminder,
            }, "Política y agenda guardadas")}>Guardar</button>
          </div>
        </div>
      )}

      {tab === "mensajes" && <Templates show={show} fail={fail} />}

      {tab === "mp" && (
        <div className="tn-card">
          <h2>Mercado Pago</h2>
          <p className="tn-muted">Cargá las credenciales de tu cuenta: la plata de las señas va directo a vos. Mercado Pago cobra sus comisiones; Turnia no cobra nada extra. El pago se confirma contra Mercado Pago, nunca por la redirección del navegador.</p>
          <div className="product-form">
            <Field label="Access Token" hint={s.mp_configured ? `Conectado (${s.mp_access_token}). Pegá uno nuevo para cambiarlo.` : "Lo encontrás en Mercado Pago → Tu negocio → Credenciales."}>
              <input type="password" autoComplete="off" value={mpToken} placeholder={s.mp_configured ? s.mp_access_token : "APP_USR-…"} onChange={(e) => setMpToken(e.target.value)} />
            </Field>
            <Field label="Public Key (opcional)"><input value={s.mp_public_key || ""} onChange={(e) => set("mp_public_key", e.target.value)} /></Field>
            <div className="tn-row">
              <button className="primary-button" disabled={!mpToken && !s.mp_public_key}
                onClick={() => { saveSettings({ ...(mpToken ? { mp_access_token: mpToken } : {}), mp_public_key: s.mp_public_key ?? "" }, "Mercado Pago guardado"); setMpToken(""); }}>Guardar</button>
              {s.mp_configured && <button className="secondary-button" onClick={() => saveSettings({ mp_access_token: "" }, "Mercado Pago desconectado")}>Desconectar</button>}
            </div>
          </div>
        </div>
      )}

      {tab === "venc" && <VenueDocs show={show} fail={fail} />}

      {tab === "bajas" && (
        <div className="tn-grid-2">
          <div className="tn-card" style={{ gridColumn: "1 / -1" }} data-tour="config-bajas">
            <div className="tn-card-head"><div><h2>Bajas y arrepentimientos de tus clientes</h2>
              <p>Tus clientes los piden desde las páginas públicas, sin registro previo (Disposición 954/2025). Cada pedido tiene fecha, hora y código; tenés 24 horas para responder con el código de gestión.</p></div></div>
            {requests.length === 0 ? <EmptyAction title="Todavía no hay pedidos" text="Cuando un cliente use el botón de baja o de arrepentimiento, aparece acá y en Inicio." /> : (
              <ul className="tn-list">{requests.map((r) => (
                <li key={r.id}><div className="tn-list-main"><strong>{r.kind_label} · {r.name} · Código {r.code}</strong>
                  <small>{dateTime(r.requested_at)} · {r.contact}{r.detail ? ` · ${r.detail}` : ""}{r.resolution_note ? ` · Respuesta: ${r.resolution_note}` : ""}</small></div>
                  {r.status === "RECIBIDA"
                    ? <><Pill tone={r.overdue ? "red" : "orange"}>{r.overdue ? "Vencida" : `Quedan ${Math.max(0, Math.floor(r.hours_left ?? 0))} h`}</Pill><button className="secondary-button" onClick={() => setResolving(r)}>Responder</button></>
                    : <Pill tone={r.status === "RESUELTA" ? "green" : "gray"}>{r.status === "RESUELTA" ? "Resuelta" : "Rechazada"}</Pill>}
                </li>))}</ul>
            )}
          </div>
          {user?.role === "ADMINISTRADOR" && <BajaServicioCard />}
        </div>
      )}

      {tab === "ayuda" && (
        <div className="tn-grid-2">
          <div className="tn-card" data-tour="config-tour">
            <h2>¿Cómo funcionamos?</h2>
            <p className="tn-muted">Volvé a ver el recorrido por el sistema.</p>
            <button className="primary-button" onClick={startTour}>¿Cómo funcionamos?</button>
          </div>
          <div className="tn-card">
            <h2>Tus páginas públicas</h2>
            <p className="tn-muted">Links para el Instagram, el WhatsApp o un QR impreso.</p>
            {webs.filter(([m]) => canAccess(user, m)).length === 0 ? <p className="tn-muted">Tu plan no incluye páginas públicas todavía.</p> : (
              <div className="product-form">
                {webs.filter(([m]) => canAccess(user, m)).map(([m, label, url]) => (
                  <div key={m} className="tn-link-box"><div><strong>{label}</strong><br /><code>{url}</code></div>
                    <button className="secondary-button" onClick={() => { navigator.clipboard?.writeText(url); show("Link copiado"); }}>Copiar</button></div>
                ))}
              </div>
            )}
          </div>
          <div className="tn-card" style={{ gridColumn: "1 / -1" }}>
            <h2>Importante</h2>
            <p className="tn-muted">Turnia no emite comprobantes fiscales: todo recibo y cierre dice «Documento no válido como factura». Facturás con tu sistema habitual de ARCA. Los mensajes de WhatsApp los enviás vos con un toque: el sistema no envía nada solo. Los datos de salud de tus clientes son sensibles (Ley 25.326): se piden con consentimiento y recepción ve solo la alerta.</p>
          </div>
        </div>
      )}

      {confirmPreset && (
        <ConfirmModal title="Cargar lo sugerido" confirmLabel="Cargar" busy={busy} onClose={() => setConfirmPreset(false)} onConfirm={applyPreset}>
          Se agregan servicios, fichas, consentimientos y mensajes del rubro {preset?.label.toLowerCase()}. No se borra ni se cambia nada de lo que ya cargaste. Podés repetirlo sin duplicar.
        </ConfirmModal>
      )}
      {resolving && <ResolveModal req={resolving} onClose={() => setResolving(null)} onDone={() => { setResolving(null); loadRequests(); show("Respuesta registrada"); }} />}
      {flash}
    </section>
  );
}

function Templates({ show, fail }: { show: (t: string) => void; fail: (e: unknown) => void }) {
  const [rows, setRows] = useState<Template[] | null>(null);
  const load = useCallback(() => { appApi<Template[]>("/message-templates").then(setRows).catch(fail); }, [fail]);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <Loading />;
  async function save(t: Template) {
    try { await appApi(`/message-templates/${t.id}`, { method: "PUT", body: { kind: t.kind, name: t.name, body: t.body, active: t.active } }); show("Mensaje guardado"); load(); } catch (e) { fail(e); }
  }
  return (
    <div className="tn-card">
      <h2>Plantillas de mensajes</h2>
      <p className="tn-muted">Variables: {"{nombre} {fecha} {hora} {servicio} {profesional} {local} {link} {direccion}"}. Se arman para WhatsApp (wa.me) y los enviás vos con un toque desde la agenda: el sistema no envía nada solo.</p>
      {rows.length === 0 ? <EmptyAction title="Todavía no hay plantillas" text="En «Rubro y vocabulario» podés cargar las sugeridas de tu rubro." /> : (
        <div className="tn-rows">{rows.map((t, i) => (
          <div key={t.id} className="tn-card" style={{ padding: 14 }}>
            <div className="tn-row"><strong>{KIND_LABEL[t.kind] || t.kind}</strong><Switch on={t.active} onChange={(v) => setRows(rows.map((x, j) => j === i ? { ...x, active: v } : x))} label="Activa" /></div>
            <textarea rows={3} aria-label={`Texto de ${t.name}`} value={t.body} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} style={{ width: "100%", margin: "8px 0" }} />
            <button className="secondary-button" onClick={() => save(t)}>Guardar</button>
          </div>))}</div>
      )}
    </div>
  );
}

function ResolveModal({ req, onClose, onDone }: { req: DistanceReq; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState("RESUELTA");
  const [note, setNote] = useState("");
  const [refund, setRefund] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function send() {
    setSaving(true); setError("");
    try { await appApi(`/distance-requests/${req.id}/resolve`, { method: "POST", body: { status, resolution_note: strOrNull(note), refund_amount: numOrNull(refund) } }); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setSaving(false); }
  }
  return (
    <Modal eyebrow={req.kind_label.toUpperCase()} title={`Código ${req.code}`} onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="primary-button" onClick={send} disabled={saving}>{saving ? "Guardando..." : "Registrar respuesta"}</button></>}>
      <div className="product-form">
        <p className="tn-muted">{req.name} · {req.contact}. Respondele por ese contacto con el código de gestión. Los servicios ya prestados no se devuelven.</p>
        <Field label="Resultado"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="RESUELTA">Resuelta</option><option value="RECHAZADA">Rechazada (con motivo)</option></select></Field>
        <Field label="Importe devuelto ($, opcional)"><input inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value)} /></Field>
        <Field label="Nota"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {error && <div className="tn-note tn-note-error">{error}</div>}
      </div>
    </Modal>
  );
}

export default Configuracion;
