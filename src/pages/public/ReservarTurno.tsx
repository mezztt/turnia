// /t/:slug · Turnos online (G1): servicios, con quién, día y hora, datos, seña y confirmación. Lista de espera si no hay horarios.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { addDays, dayKey, money, parseDay, publicApi } from "../../config";
import { Consent, Shell } from "../../components/public/Shell";
import type { Venue } from "../../components/public/types";
import Icon from "../../components/Icons";
import "../../g1.css";

interface PSvc { id: number; name: string; description: string | null; price: number; price_max: number; price_is_from: boolean; duration_min: number; duration_max: number; deposit: number; professionals: number[] }
interface Catalog { categories: { id: number | null; name: string; services: PSvc[] }[]; professionals: { id: number; name: string; role_label: string | null }[]; allow_professional_choice: boolean }
interface Slot { time: string; start_at: string; end_at: string; professionals: string[] }
interface Avail { days: { date: string; slots: Slot[] }[] }
interface Booked { token: string; appointment: { total: number; deposit: { required: boolean; amount: number; needs_payment: boolean; hold_expires_at: string | null }; start_at: string; status: string }; payment: { required: boolean; amount: number; mp_enabled: boolean; link: string | null; error: string | null } }

const STEPS = ["Servicios", "Día y hora", "Tus datos", "Listo"];
const DAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const dur = (s: PSvc) => (s.duration_max > s.duration_min ? `${s.duration_min} a ${s.duration_max} min` : `${s.duration_min} min`);
const price = (s: PSvc) => (s.price_is_from || s.price_max > s.price ? `desde ${money(s.price)}` : money(s.price));

export default function ReservarTurno() {
  const { slug = "" } = useParams();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [cat, setCat] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [proId, setProId] = useState("");
  const [from, setFrom] = useState(() => dayKey(new Date()));
  const [avail, setAvail] = useState<Avail | null>(null);
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [f, setF] = useState({ name: "", phone: "", email: "", birthday: "", notes: "", guardian_name: "", guardian_dni: "", guardian_phone: "", marketing: false });
  const [consent, setConsent] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [booked, setBooked] = useState<Booked | null>(null);
  const [wait, setWait] = useState(false);

  useEffect(() => {
    publicApi<Venue>(`/public/${slug}/info`).then((v) => setVenue({ ...v, slug })).catch((e) => setError(e.message));
    publicApi<Catalog>(`/public/${slug}/services`).then(setCat).catch((e) => setError(e.message));
  }, [slug]);

  const all = useMemo(() => (cat?.categories || []).flatMap((c) => c.services), [cat]);
  const chosen = picked.map((id) => all.find((s) => s.id === id)).filter(Boolean) as PSvc[];
  const total = chosen.reduce((t, s) => t + s.price, 0);
  const minutes = chosen.reduce((t, s) => t + s.duration_min, 0);
  const deposit = chosen.reduce((t, s) => t + s.deposit, 0);
  const canPickPro = !!cat?.allow_professional_choice;
  // quién puede hacer TODOS los servicios elegidos
  const proOptions = useMemo(() => (cat?.professionals || []).filter((p) => chosen.length > 0 && chosen.every((s) => s.professionals.includes(p.id))), [cat, picked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (proId && !proOptions.some((p) => String(p.id) === proId)) setProId(""); }, [proOptions, proId]);

  const query = useMemo(() => picked.map((id) => (proId ? `${id}:${proId}` : String(id))).join(","), [picked, proId]);
  useEffect(() => {
    if (step !== 1 || !picked.length) return;
    setAvail(null);
    publicApi<Avail>(`/public/${slug}/availability?services=${query}&date_from=${from}&date_to=${dayKey(addDays(parseDay(from), 13))}`)
      .then((a) => { setAvail(a); const first = a.days.find((d) => d.slots.length); setDay((d) => (a.days.some((x) => x.date === d && x.slots.length) ? d : first?.date || "")); })
      .catch((e) => { setFormError(e.message); setAvail({ days: [] }); });
  }, [step, query, from, slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: number) => { setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 6 ? p : [...p, id])); setSlot(null); };
  const minor = f.birthday ? (Date.now() - new Date(f.birthday).getTime()) / (365.25 * 864e5) < 18 : false;
  const withSlots = avail?.days.filter((d) => d.slots.length) || [];
  const slotsOfDay = avail?.days.find((d) => d.date === day)?.slots || [];

  async function book() {
    setFormError("");
    if (f.name.trim().length < 2) return setFormError("Poné tu nombre");
    if (f.phone.trim().length < 6) return setFormError("Poné tu teléfono con código de área, por ejemplo 261 555 1234");
    if (venue?.tattoo_mode && !f.birthday) return setFormError("Necesitamos tu fecha de nacimiento");
    if (minor && !(f.guardian_name.trim() && f.guardian_dni.trim())) return setFormError("Sos menor de edad: poné el nombre y DNI de quien te acompaña");
    if (!consent) return setFormError("Para reservar tenés que aceptar el uso de tus datos");
    if (!policy) return setFormError("Tenés que aceptar la política de seña y cancelación");
    if (!slot) return;
    setBusy(true);
    try {
      const r = await publicApi<Booked>(`/public/${slug}/appointments`, { method: "POST", body: {
        items: picked.map((id) => ({ service_id: id, professional_id: proId ? Number(proId) : null })), start_at: slot.start_at, data_consent: true, policy_accepted: true, notes: f.notes.trim() || null,
        customer: { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() || null, birthday: f.birthday || null, marketing_opt_in: f.marketing,
          guardian_name: minor ? f.guardian_name.trim() : null, guardian_dni_text: minor ? f.guardian_dni.trim() : null, guardian_phone: minor ? f.guardian_phone.trim() || null : null } } });
      setBooked(r); setStep(3);
    } catch (e) {
      setFormError((e instanceof Error ? e.message : "No se pudo reservar") + " Si el horario se ocupó, elegí otro.");
    } finally { setBusy(false); }
  }

  const showSteps = step < 3;
  return (
    <Shell title="Turnos online" venue={venue} heading="Reservá tu turno" intro="Elegí el servicio, quién te atiende y el horario." error={error}>
      {!cat && !error && <div className="pb-card"><span className="pb-step-label">Cargando</span></div>}
      {cat && (<>
        {showSteps && <ol className="g1p-steps" aria-label="Pasos">{STEPS.slice(0, 3).map((s, i) => <li key={s} className={i === step ? "is-on" : i < step ? "is-done" : ""} aria-current={i === step ? "step" : undefined}>{i + 1}. {s}</li>)}</ol>}

        {step === 0 && (
          <div className="pb-card">
            <span className="pb-step-label">1. Elegí lo que querés hacerte</span>
            {cat.categories.length === 0 && <p className="tn-pub-legal">Por ahora no hay servicios para reservar online. Escribinos por WhatsApp.</p>}
            {cat.categories.map((c) => (
              <div key={c.id ?? "x"}><div className="g1p-cat">{c.name}</div>
                {c.services.map((s) => { const on = picked.includes(s.id); return (
                  <button key={s.id} type="button" className={`g1p-svc ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => toggle(s.id)}>
                    <span className="box">{on && <Icon name="check" />}</span>
                    <span><strong>{s.name}</strong><small>{dur(s)}{s.deposit > 0 ? ` · seña ${money(s.deposit)}` : ""}</small>{s.description && <small>{s.description}</small>}</span>
                    <span className="price">{price(s)}</span>
                  </button>); })}</div>))}
            {canPickPro && chosen.length > 0 && proOptions.length > 0 && (
              <div className="pb-field" style={{ marginTop: 14 }}><label htmlFor="g1p-pro">¿Con quién?</label>
                <select id="g1p-pro" value={proId} onChange={(e) => setProId(e.target.value)}><option value="">Con quien tenga lugar</option>{proOptions.map((p) => <option key={p.id} value={p.id}>{p.name}{p.role_label ? ` · ${p.role_label}` : ""}</option>)}</select></div>)}
            {chosen.length > 0 && <div className="g1p-sum" style={{ marginTop: 14 }}><div><span>{chosen.length} {chosen.length === 1 ? "servicio" : "servicios"} · unos {minutes} min</span><b>{money(total)}</b></div>
              {deposit > 0 && <div><small>Seña para reservar</small><small>{money(deposit)}</small></div>}</div>}
            <button className="pb-btn" disabled={!chosen.length} onClick={() => { setFormError(""); setStep(1); }}>Elegir día y hora</button>
          </div>)}

        {step === 1 && (
          <div className="pb-card">
            <span className="pb-step-label">2. Elegí el día y la hora</span>
            {formError && <div className="pb-error" role="alert">{formError}</div>}
            {!avail ? <p className="tn-pub-legal">Buscando horarios...</p> : withSlots.length === 0 ? (
              <div>
                <p>No encontramos horarios libres en estos días. Podés mirar los días siguientes o anotarte en la lista de espera: si se libera un lugar, el local te escribe por WhatsApp.</p>
                <div className="g1p-btns"><button className="pb-btn pb-btn-ghost" onClick={() => setFrom(dayKey(addDays(parseDay(from), 14)))}>Ver 2 semanas más</button><button className="pb-btn" onClick={() => setWait(true)}>Anotarme en la lista de espera</button></div>
              </div>) : (<>
              <div className="g1p-days" role="tablist" aria-label="Días con horarios">{withSlots.map((d) => { const dt = parseDay(d.date); return (
                <button key={d.date} role="tab" aria-selected={day === d.date} className={`g1p-day ${day === d.date ? "is-on" : ""}`} onClick={() => { setDay(d.date); setSlot(null); }}>
                  <small>{DAYS_SHORT[dt.getDay()]}</small><b>{dt.getDate()}</b><small>{dt.getMonth() + 1}/{String(dt.getFullYear()).slice(2)}</small></button>); })}</div>
              <div className="g1p-times">{slotsOfDay.map((s) => <button key={s.start_at} className={`g1p-time ${slot?.start_at === s.start_at ? "is-on" : ""}`} aria-pressed={slot?.start_at === s.start_at} onClick={() => setSlot(s)}>{s.time}</button>)}</div>
              {slot && slot.professionals.filter(Boolean).length > 0 && <p className="tn-pub-legal">Te atiende: {[...new Set(slot.professionals.filter(Boolean))].join(" y ")}.</p>}
              <button type="button" className="pb-btn pb-btn-ghost" style={{ marginTop: 12 }} onClick={() => setFrom(dayKey(addDays(parseDay(from), 14)))}>Buscar más adelante</button>
              <button type="button" className="pb-btn pb-btn-ghost" style={{ marginTop: 12, marginLeft: 8 }} onClick={() => setWait(true)}>Ninguno me sirve: lista de espera</button>
            </>)}
            <div className="g1p-btns" style={{ marginTop: 16 }}><button className="pb-btn pb-btn-ghost" onClick={() => { setStep(0); setFormError(""); }}>Volver</button>
              <button className="pb-btn" disabled={!slot} onClick={() => { setFormError(""); setStep(2); }}>Seguir</button></div>
          </div>)}

        {step === 2 && slot && (
          <div className="pb-card">
            <span className="pb-step-label">3. Tus datos</span>
            <div className="g1p-sum">
              {chosen.map((s) => <div key={s.id}><span>{s.name}</span><span>{money(s.price)}</span></div>)}
              <div className="tot"><span>{parseDay(slot.start_at.slice(0, 10)).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })} · {slot.time}</span><b>{money(total)}</b></div>
              {deposit > 0 && <div><small>Seña para confirmar</small><small>{money(deposit)}</small></div>}
            </div>
            {formError && <div className="pb-error" role="alert">{formError}</div>}
            <div className="pb-field"><label htmlFor="rn">Nombre y apellido</label><input id="rn" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="pb-field"><label htmlFor="rp">WhatsApp</label><input id="rp" type="tel" inputMode="tel" autoComplete="tel" placeholder="261 555 1234" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div className="pb-field"><label htmlFor="re">Email (opcional)</label><input id="re" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div className="pb-field"><label htmlFor="rb">Fecha de nacimiento{venue?.tattoo_mode ? "" : " (opcional)"}</label><input id="rb" type="date" autoComplete="bday" value={f.birthday} onChange={(e) => setF({ ...f, birthday: e.target.value })} /></div>
            {minor && (<>
              <div className="pb-error" style={{ background: "#fdefd9", color: "#6b3a00" }}>Sos menor de edad: tiene que acompañarte tu madre, padre o tutor.</div>
              <div className="pb-field"><label htmlFor="gn">Nombre de tu madre, padre o tutor</label><input id="gn" value={f.guardian_name} onChange={(e) => setF({ ...f, guardian_name: e.target.value })} /></div>
              <div className="pb-field"><label htmlFor="gd">DNI</label><input id="gd" inputMode="numeric" value={f.guardian_dni} onChange={(e) => setF({ ...f, guardian_dni: e.target.value })} /></div>
              <div className="pb-field"><label htmlFor="gp">Teléfono (opcional)</label><input id="gp" type="tel" value={f.guardian_phone} onChange={(e) => setF({ ...f, guardian_phone: e.target.value })} /></div></>)}
            <div className="pb-field"><label htmlFor="ro">¿Algo que quieras avisarnos? (opcional)</label><textarea id="ro" rows={2} maxLength={300} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            <Consent checked={consent} onChange={setConsent} />
            <label className="tn-pub-check"><input type="checkbox" checked={policy} onChange={(e) => setPolicy(e.target.checked)} />
              <span>Leí y acepto la política de seña y cancelación{venue?.cancel_policy_text ? `: ${venue.cancel_policy_text}` : ` (se puede cancelar sin costo hasta ${venue?.cancel_free_hours ?? 24} horas antes)`}.</span></label>
            <label className="tn-pub-check"><input type="checkbox" checked={f.marketing} onChange={(e) => setF({ ...f, marketing: e.target.checked })} />
              <span>Quiero recibir novedades y saludos por WhatsApp (opcional, lo podés cambiar cuando quieras).</span></label>
            <div className="g1p-btns" style={{ marginTop: 14 }}><button className="pb-btn pb-btn-ghost" onClick={() => { setStep(1); setFormError(""); }}>Volver</button>
              <button className="pb-btn" disabled={busy} onClick={book}>{busy ? "Reservando..." : deposit > 0 ? "Reservar y pagar la seña" : "Confirmar turno"}</button></div>
          </div>)}

        {step === 3 && booked && <Confirmation booked={booked} venue={venue} />}
      </>)}
      {wait && cat && <Waitlist slug={slug} svc={chosen[0]} proId={proId} onClose={() => setWait(false)} />}
    </Shell>
  );
}

function Confirmation({ booked, venue }: { booked: Booked; venue: Venue | null }) {
  const a = booked.appointment;
  const pay = booked.payment;
  const needs = a.deposit.needs_payment;
  return (
    <div className="pb-card">
      <span className={`g1p-status ${needs ? "wait" : "ok"}`}>{needs ? "Falta pagar la seña" : "Turno confirmado"}</span>
      <h2>{needs ? "Tu lugar está guardado" : "¡Listo, te esperamos!"}</h2>
      <p>{new Date(a.start_at).toLocaleString("es-AR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false })} hs.</p>
      {needs && (<>
        <p>Seña: <b>{money(pay.amount || a.deposit.amount)}</b>. {a.deposit.hold_expires_at ? `Guardamos el horario hasta las ${new Date(a.deposit.hold_expires_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })}; después se libera.` : ""}</p>
        {pay.error && <div className="pb-error" role="alert">{pay.error}</div>}
        {pay.link ? <a className="pb-btn" href={pay.link}>Pagar la seña con Mercado Pago</a>
          : <p className="tn-pub-legal">Este local cobra la seña por transferencia o en persona: escribile por WhatsApp para coordinar{venue?.whatsapp_phone ? ` al ${venue.whatsapp_phone}` : ""}.</p>}
      </>)}
      <p style={{ marginTop: 14 }}>Con este enlace podés ver, mover o cancelar tu turno. Guardalo, es personal.</p>
      <div className="g1p-btns"><Link className="pb-btn pb-btn-ghost" to={`/mi-turno/${booked.token}`}>Ver mi turno</Link></div>
    </div>
  );
}

function Waitlist({ slug, svc, proId, onClose }: { slug: string; svc?: PSvc; proId: string; onClose: () => void }) {
  const [f, setF] = useState({ name: "", phone: "" });
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setError("");
    if (f.name.trim().length < 2) return setError("Poné tu nombre");
    if (f.phone.trim().length < 6) return setError("Poné tu teléfono con código de área");
    if (!consent) return setError("Tenés que aceptar el uso de tus datos");
    if (!svc) return;
    setBusy(true);
    try { const r = await publicApi<{ detail: string }>(`/public/${slug}/waitlist`, { method: "POST", body: { name: f.name.trim(), phone: f.phone.trim(), service_id: svc.id, professional_id: proId ? Number(proId) : null, data_consent: true } }); setMsg(r.detail); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo anotar"); } finally { setBusy(false); }
  }
  return (
    <div className="pb-card" role="region" aria-label="Lista de espera">
      <span className="pb-step-label">Lista de espera</span>
      {msg ? (<><p>{msg}</p><button className="pb-btn pb-btn-ghost" onClick={onClose}>Cerrar</button></>) : (<>
        <p>Te anotamos para {svc?.name}. Si se libera un horario, el local te escribe por WhatsApp.</p>
        {error && <div className="pb-error" role="alert">{error}</div>}
        <div className="pb-field"><label htmlFor="wn">Nombre</label><input id="wn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="pb-field"><label htmlFor="wp">WhatsApp</label><input id="wp" type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <Consent checked={consent} onChange={setConsent} />
        <div className="g1p-btns"><button className="pb-btn pb-btn-ghost" onClick={onClose}>Cancelar</button><button className="pb-btn" disabled={busy} onClick={send}>Anotarme</button></div></>)}
    </div>
  );
}
