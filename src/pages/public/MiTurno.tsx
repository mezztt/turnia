// /mi-turno/:token, /resena/:token y /mi-pack/:token · links personales con token, sin login (G1).
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { addDays, dayKey, money, parseDay, publicApi, saveBlob } from "../../config";
import { Shell } from "../../components/public/Shell";
import type { Venue } from "../../components/public/types";
import Icon from "../../components/Icons";
import "../../g1.css";

interface View {
  venue: { name: string; address: string | null; phone: string | null; whatsapp_phone: string | null; slug: string; mp_enabled: boolean; instagram: string | null };
  customer_first_name: string | null; status: string; date: string; start_at: string; end_at: string;
  items: { name: string; professional: string | null; start_at: string; end_at: string; price: number }[]; total: number;
  deposit: { required: boolean; amount: number; status: string; paid: number; needs_payment: boolean; pending_link: boolean; hold_expires_at: string | null };
  policy_text: string | null; cancel_free_hours: number; free_cancel_until: string | null; can_cancel: boolean; late_cancel: boolean; can_reschedule: boolean;
  cancelled_by: string | null; cancel_reason: string | null; calendar: { title: string; start_at: string; end_at: string; location: string }; expires_on: string;
}
const STATUS: Record<string, [string, string]> = {
  PENDIENTE_SENIA: ["Falta pagar la seña", "wait"], CONFIRMADO: ["Turno confirmado", "ok"], EN_SALA: ["Ya llegaste", "ok"], EN_CURSO: ["En curso", "ok"],
  FINALIZADO: ["Turno terminado", "off"], CANCELADO: ["Turno cancelado", "bad"], NO_SHOW: ["No asististe", "bad"],
};
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
const ics = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
const esc = (t: string) => t.replace(/[\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");

export default function MiTurno({ kind }: { kind: "turno" | "resena" | "pack" }) {
  const { token = "" } = useParams();
  if (kind === "turno") return <Turno token={token} />;
  if (kind === "resena") return <Resena token={token} />;
  return <Pack token={token} />;
}

// ---------------- turno ----------------
function Turno({ token }: { token: string }) {
  const [params] = useSearchParams();
  const [v, setV] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"" | "cancel" | "move">("");
  const [reason, setReason] = useState("");
  const venue = v ? ({ slug: v.venue.slug, name: v.venue.name, address: v.venue.address, phone: v.venue.phone, whatsapp_phone: v.venue.whatsapp_phone, instagram: v.venue.instagram, opening_hours: {} } as unknown as Venue) : null;

  const load = useCallback(() => publicApi<View>(`/public/appointment/${token}`).then((d) => { setV(d); return d; }).catch((e) => { setError(e.message); return null; }), [token]);
  useEffect(() => {
    load().then((d) => {
      if (d && params.get("mp") === "1" && d.deposit.needs_payment) {
        publicApi<{ paid: boolean; appointment: View }>(`/public/${d.venue.slug}/mp/verify`, { method: "POST", body: { token } })
          .then((r) => { setV(r.appointment); setMsg(r.paid ? "Recibimos tu pago. ¡Tu turno quedó confirmado!" : "Todavía no vemos el pago. Puede demorar unos minutos: volvé a mirar en un rato."); })
          .catch((e) => setMsg(e.message));
      }
    });
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pay() {
    setBusy(true); setMsg("");
    try { const r = await publicApi<{ payment: { link: string | null } }>(`/public/appointment/${token}/pay`, { method: "POST" }); if (r.payment.link) window.location.href = r.payment.link; }
    catch (e) { setMsg(e instanceof Error ? e.message : "No se pudo generar el pago"); } finally { setBusy(false); }
  }
  async function checkPaid() {
    if (!v) return;
    setBusy(true); setMsg("");
    try { const r = await publicApi<{ paid: boolean; appointment: View }>(`/public/${v.venue.slug}/mp/verify`, { method: "POST", body: { token } }); setV(r.appointment); setMsg(r.paid ? "Recibimos tu pago. ¡Tu turno quedó confirmado!" : "Todavía no vemos el pago. Puede demorar unos minutos."); }
    catch (e) { setMsg(e instanceof Error ? e.message : "No se pudo revisar"); } finally { setBusy(false); }
  }
  async function cancel() {
    setBusy(true); setMsg("");
    try { const r = await publicApi<{ appointment: View; late_cancel: boolean }>(`/public/appointment/${token}/cancel`, { method: "POST", body: { reason: reason.trim() || null } }); setV(r.appointment); setMode(""); setMsg(r.late_cancel ? "Cancelamos tu turno. Como fue fuera de plazo, la seña queda retenida según la política del local." : "Cancelamos tu turno. ¡Gracias por avisar!"); }
    catch (e) { setMsg(e instanceof Error ? e.message : "No se pudo cancelar"); } finally { setBusy(false); }
  }
  function download() {
    if (!v) return;
    const c = v.calendar;
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Turnia//ES", "BEGIN:VEVENT", `UID:turno-${token.slice(0, 12)}@turnia`, `DTSTAMP:${ics(new Date())}`,
      `DTSTART:${ics(new Date(c.start_at))}`, `DTEND:${ics(new Date(c.end_at))}`, `SUMMARY:${esc(`${c.title} · ${v.venue.name}`)}`, `LOCATION:${esc(c.location || "")}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    saveBlob(new Blob([body], { type: "text/calendar" }), "mi-turno.ics");
  }
  const gcal = v ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${v.calendar.title} · ${v.venue.name}`)}&dates=${ics(new Date(v.calendar.start_at))}/${ics(new Date(v.calendar.end_at))}&location=${encodeURIComponent(v.calendar.location || "")}` : "";
  const wa = v?.venue.whatsapp_phone ? `https://wa.me/${v.venue.whatsapp_phone.replace(/\D/g, "")}` : null;
  const [label, tone] = v ? STATUS[v.status] || [v.status, "off"] : ["", "off"];

  return (
    <Shell title="Mi turno" venue={venue} heading={v?.customer_first_name ? `Hola, ${v.customer_first_name}` : "Mi turno"} intro="Este enlace es personal: no lo compartas." error={error}>
      {!v && !error && <div className="pb-card"><span className="pb-step-label">Cargando</span></div>}
      {v && (<>
        {msg && <div className="pb-card" role="status"><p style={{ margin: 0, color: "#27122a", fontWeight: 700 }}>{msg}</p></div>}
        <div className="pb-card">
          <span className={`g1p-status ${tone}`}>{label}</span>
          <h2>{fmtDay(v.start_at)}</h2>
          <p style={{ marginBottom: 12 }}>{fmtTime(v.start_at)} a {fmtTime(v.end_at)} hs{v.venue.address ? ` · ${v.venue.address}` : ""}</p>
          <ul className="g1p-lines">{v.items.map((i, k) => <li key={k}><span>{i.name}{i.professional && <small>con {i.professional} · {fmtTime(i.start_at)}</small>}</span><b>{money(i.price)}</b></li>)}
            <li><span><b>Total</b></span><b>{money(v.total)}</b></li></ul>
          {v.status === "CANCELADO" && <p>{v.cancelled_by === "CLIENTE" ? "Lo cancelaste vos." : "Lo canceló el local."}</p>}

          {v.deposit.required && v.status !== "CANCELADO" && (
            <div className="g1p-sum"><div><span>Seña</span><b>{money(v.deposit.amount)}</b></div>
              <div><small>Estado</small><small>{v.deposit.needs_payment ? "Pendiente" : v.deposit.status === "PAGADA" ? "Paga" : v.deposit.status}</small></div>
              {v.deposit.needs_payment && v.deposit.hold_expires_at && <div><small>Guardamos el horario hasta</small><small>{fmtTime(v.deposit.hold_expires_at)} hs</small></div>}</div>)}
          {v.deposit.needs_payment && (
            <div className="g1p-btns">
              {v.venue.mp_enabled ? (<><button className="pb-btn" onClick={pay} disabled={busy}>Pagar la seña</button>
                {v.deposit.pending_link && <button className="pb-btn pb-btn-ghost" onClick={checkPaid} disabled={busy}>Ya pagué</button>}</>)
                : <p className="tn-pub-legal">La seña se paga por transferencia o en persona. Escribile al local para coordinar{wa ? "" : "."}</p>}
              {wa && !v.venue.mp_enabled && <a className="pb-btn pb-btn-ghost" href={wa} target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>}
            </div>)}
        </div>

        {(v.status === "CONFIRMADO" || v.status === "PENDIENTE_SENIA") && (
          <div className="pb-card">
            <span className="pb-step-label">Agregalo a tu calendario</span>
            <div className="g1p-btns"><button className="pb-btn pb-btn-ghost" onClick={download}><Icon name="calendar" size={16} /> Descargar (.ics)</button>
              <a className="pb-btn pb-btn-ghost" href={gcal} target="_blank" rel="noopener noreferrer">Google Calendar</a></div>
          </div>)}

        {(v.can_cancel || v.can_reschedule) && !mode && (
          <div className="pb-card">
            <span className="pb-step-label">¿No podés venir?</span>
            <p>{v.free_cancel_until && v.can_reschedule ? `Podés moverlo o cancelarlo sin costo hasta el ${fmtDay(v.free_cancel_until)} a las ${fmtTime(v.free_cancel_until)} hs.` : "Ya pasó el plazo para moverlo sin costo."}</p>
            <div className="g1p-btns">{v.can_reschedule && <button className="pb-btn pb-btn-ghost" onClick={() => setMode("move")}>Cambiar día u hora</button>}
              {v.can_cancel && <button className="pb-btn pb-btn-ghost" onClick={() => setMode("cancel")}>Cancelar el turno</button>}</div>
          </div>)}

        {mode === "cancel" && (
          <div className="pb-card" role="region" aria-label="Cancelar turno">
            <span className="pb-step-label">Cancelar el turno</span>
            {v.late_cancel ? <div className="pb-error" style={{ background: "#fdefd9", color: "#6b3a00" }}>Estás cancelando fuera de plazo (menos de {v.cancel_free_hours} horas antes){v.deposit.paid > 0 ? `: la seña de ${money(v.deposit.paid)} queda retenida` : ""}. {v.policy_text}</div>
              : <p>{v.deposit.paid > 0 ? "Tu seña queda según la política del local." : "No tiene costo."}{v.policy_text ? ` ${v.policy_text}` : ""}</p>}
            <div className="pb-field"><label htmlFor="cr">Motivo (opcional)</label><input id="cr" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></div>
            <div className="g1p-btns"><button className="pb-btn pb-btn-ghost" onClick={() => setMode("")}>Volver</button><button className="pb-btn" onClick={cancel} disabled={busy}>Sí, cancelar</button></div>
          </div>)}
        {mode === "move" && <Reschedule token={token} onDone={(a) => { setV(a); setMode(""); setMsg("Listo, movimos tu turno."); }} onBack={() => setMode("")} />}
        {wa && v.status !== "CANCELADO" && <div className="pb-card"><span className="pb-step-label">¿Dudas?</span><a className="pb-btn pb-btn-ghost" href={wa} target="_blank" rel="noopener noreferrer"><Icon name="message" size={16} /> Escribir al local</a></div>}
      </>)}
    </Shell>
  );
}

function Reschedule({ token, onDone, onBack }: { token: string; onDone: (a: View) => void; onBack: () => void }) {
  const [from, setFrom] = useState(dayKey(new Date()));
  const [av, setAv] = useState<{ days: { date: string; slots: { time: string; start_at: string }[] }[] } | null>(null);
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setAv(null);
    publicApi<typeof av>(`/public/appointment/${token}/availability?date_from=${from}&date_to=${dayKey(addDays(parseDay(from), 13))}`)
      .then((a) => { setAv(a); setDay(a?.days.find((d) => d.slots.length)?.date || ""); }).catch((e) => { setErr(e.message); setAv({ days: [] }); });
  }, [from, token]);
  async function go() {
    setBusy(true); setErr("");
    try { const r = await publicApi<{ appointment: View }>(`/public/appointment/${token}/reschedule`, { method: "POST", body: { start_at: slot } }); onDone(r.appointment); }
    catch (e) { setErr(e instanceof Error ? e.message : "No se pudo mover"); } finally { setBusy(false); }
  }
  const days = av?.days.filter((d) => d.slots.length) || [];
  const times = av?.days.find((d) => d.date === day)?.slots || [];
  return (
    <div className="pb-card" role="region" aria-label="Cambiar el turno">
      <span className="pb-step-label">Elegí el nuevo horario</span>
      {err && <div className="pb-error" role="alert">{err}</div>}
      {!av ? <p className="tn-pub-legal">Buscando horarios...</p> : days.length === 0 ? <p>No hay horarios libres en estos días.</p> : (<>
        <div className="g1p-days">{days.map((d) => { const dt = parseDay(d.date); return <button key={d.date} className={`g1p-day ${day === d.date ? "is-on" : ""}`} onClick={() => { setDay(d.date); setSlot(""); }}><small>{["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][dt.getDay()]}</small><b>{dt.getDate()}</b><small>{dt.getMonth() + 1}/{String(dt.getFullYear()).slice(2)}</small></button>; })}</div>
        <div className="g1p-times">{times.map((s) => <button key={s.start_at} className={`g1p-time ${slot === s.start_at ? "is-on" : ""}`} aria-pressed={slot === s.start_at} onClick={() => setSlot(s.start_at)}>{s.time}</button>)}</div></>)}
      <div className="g1p-btns" style={{ marginTop: 14 }}><button className="pb-btn pb-btn-ghost" onClick={onBack}>Volver</button>
        <button className="pb-btn pb-btn-ghost" onClick={() => setFrom(dayKey(addDays(parseDay(from), 14)))}>Más adelante</button>
        <button className="pb-btn" disabled={!slot || busy} onClick={go}>Mover mi turno</button></div>
    </div>
  );
}

// ---------------- reseña ----------------
interface RView { venue: { name: string; slug: string }; date: string; services: string[]; professional: string | null; customer_first_name: string | null; done: boolean; rating: number | null; google_review_url: string | null }
function Resena({ token }: { token: string }) {
  const [v, setV] = useState<RView | null>(null);
  const [error, setError] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { publicApi<RView>(`/public/review/${token}`).then(setV).catch((e) => setError(e.message)); }, [token]);
  async function send() {
    if (!rating) return setErr("Elegí cuántas estrellas");
    setBusy(true); setErr("");
    try { setV(await publicApi<RView>(`/public/review/${token}`, { method: "POST", body: { rating, comment: comment.trim() || null } })); }
    catch (e) { setErr(e instanceof Error ? e.message : "No se pudo enviar"); } finally { setBusy(false); }
  }
  const venue = v ? ({ slug: v.venue.slug, name: v.venue.name, opening_hours: {} } as unknown as Venue) : null;
  return (
    <Shell title="Tu reseña" venue={venue} heading={v?.customer_first_name ? `${v.customer_first_name}, ¿cómo te fue?` : "¿Cómo te fue?"} intro="Tu opinión nos ayuda a mejorar." error={error}>
      {!v && !error && <div className="pb-card"><span className="pb-step-label">Cargando</span></div>}
      {v && (<div className="pb-card">
        <p>{v.services.join(" + ")}{v.professional ? ` con ${v.professional}` : ""} · {parseDay(v.date).toLocaleDateString("es-AR", { day: "numeric", month: "long" })}</p>
        {v.done ? (<><h2>¡Gracias por tu opinión!</h2><div className="g1p-stars" aria-label={`Diste ${v.rating} de 5`}>{[1, 2, 3, 4, 5].map((i) => <button key={i} disabled className={i <= (v.rating || 0) ? "is-on" : ""} aria-hidden="true"><Icon name="star" /></button>)}</div></>) : (<>
          {err && <div className="pb-error" role="alert">{err}</div>}
          <div className="g1p-stars" role="radiogroup" aria-label="Puntaje">{[1, 2, 3, 4, 5].map((i) => <button key={i} role="radio" aria-checked={rating === i} aria-label={`${i} de 5`} className={i <= rating ? "is-on" : ""} onClick={() => setRating(i)}><Icon name="star" /></button>)}</div>
          <div className="pb-field"><label htmlFor="rc">Contanos más (opcional)</label><textarea id="rc" rows={4} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
          <button className="pb-btn" onClick={send} disabled={busy}>Enviar</button></>)}
        {v.done && v.google_review_url && (<><p style={{ marginTop: 14 }}>Si querés, también podés dejarla en Google.</p><a className="pb-btn pb-btn-ghost" href={v.google_review_url} target="_blank" rel="noopener noreferrer">Dejar reseña en Google</a></>)}
      </div>)}
    </Shell>
  );
}

// ---------------- pack / membresía ----------------
interface PView { kind: "PACK" | "MEMBRESIA"; local: string | null; phone: string | null; whatsapp_phone: string | null; customer: string | null; name: string; status: string; slug?: string;
  sessions_total?: number; sessions_left: number | null; expires_on?: string | null; purchased_on?: string; paid_until?: string | null; included_sessions?: number | null }
function Pack({ token }: { token: string }) {
  const [v, setV] = useState<PView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { publicApi<PView>(`/public/pack/${token}`).then(setV).catch((e) => setError(e.message)); }, [token]);
  const venue = v ? ({ slug: v.slug || "", name: v.local || "", phone: v.phone, whatsapp_phone: v.whatsapp_phone, opening_hours: {} } as unknown as Venue) : null;
  const total = v?.kind === "PACK" ? v.sessions_total : v?.included_sessions;
  const pct = total && v?.sessions_left != null ? Math.max(0, Math.min(100, (v.sessions_left / total) * 100)) : 0;
  const wa = v?.whatsapp_phone ? `https://wa.me/${v.whatsapp_phone.replace(/\D/g, "")}` : null;
  return (
    <Shell title="Mi pack" venue={venue} heading={v?.customer ? `Hola, ${v.customer}` : "Mi pack"} intro="Este enlace es personal: no lo compartas." error={error}>
      {!v && !error && <div className="pb-card"><span className="pb-step-label">Cargando</span></div>}
      {v && (<div className="pb-card">
        <span className="pb-step-label">{v.kind === "PACK" ? "Pack" : "Membresía"}</span>
        <h2>{v.name}</h2>
        {v.sessions_left != null && (<><p className="g1p-big">{v.sessions_left}{total ? <span style={{ fontSize: 18, fontWeight: 700 }}> de {total}</span> : null}</p><p>sesiones disponibles</p>
          <div className="g1p-meter" role="img" aria-label={`Quedan ${v.sessions_left}`}><span style={{ width: `${pct}%` }} /></div></>)}
        {v.kind === "PACK" && v.expires_on && <p>Vence el {parseDay(v.expires_on).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}.</p>}
        {v.kind === "MEMBRESIA" && v.paid_until && <p>Pagada hasta el {parseDay(v.paid_until).toLocaleDateString("es-AR", { day: "numeric", month: "long" })}.</p>}
        <span className={`g1p-status ${v.status === "ACTIVO" || v.status === "ACTIVA" ? "ok" : "off"}`}>{v.status}</span>
        {wa && <div className="g1p-btns"><a className="pb-btn pb-btn-ghost" href={wa} target="_blank" rel="noopener noreferrer"><Icon name="message" size={16} /> Reservar mi próxima sesión</a></div>}
      </div>)}
    </Shell>
  );
}
