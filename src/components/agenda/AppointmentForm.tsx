// Alta y edición de un turno: cliente, uno o varios servicios (cada uno con su profesional), día y hora, notas y sobreturno.
import { useEffect, useMemo, useRef, useState } from "react";
import { appApi, getSessionUser, hhmm, toLocalISO, vocab, money, splitList } from "../../config";
import { Field, Modal, Pill, strOrNull } from "../ui";
import Icon from "../Icons";
import type { Appt } from "./types";

export interface SvcOpt { id: number; name: string; category_id: number | null; price: number; duration_min: number; active: boolean; professionals: { professional_id: number }[]; deposit_mode: string }
export interface ProOpt { id: number; name: string; display_name: string | null; active: boolean }
interface CustHit { id: number; name: string; phone: string | null; health_alert: boolean; no_show_count: number; require_deposit: boolean; blocked_online: boolean }
interface Row { key: number; id?: number; service_id: string; professional_id: string; resource_id: string; parallel: boolean; offset: string }
interface Slot { time: string; start_at: string }
export interface SavedResult { appointment: Appt; message?: { text: string; wa_url: string | null } }
export interface FormPreset { start?: Date; professionalId?: number | null; customer?: { id: number; name: string; phone?: string | null }; serviceId?: number; waitlistId?: number }

let rowKey = 1;
const proName = (p: ProOpt) => p.display_name || p.name;
const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function AppointmentForm({ appt, preset, onClose, onSaved }: {
  appt?: Appt | null; preset?: FormPreset; onClose: () => void; onSaved: (r: SavedResult, created: boolean) => void;
}) {
  const user = getSessionUser();
  const v = vocab(user);
  const editing = !!appt;
  const hasResources = splitList(user?.enabled_modules).includes("recursos");
  const [services, setServices] = useState<SvcOpt[]>([]);
  const [pros, setPros] = useState<ProOpt[]>([]);
  const [resources, setResources] = useState<{ id: number; name: string; kind: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // cliente
  const [customer, setCustomer] = useState<{ id: number; name: string; phone?: string | null; alert?: string } | null>(
    appt?.customer ? { id: appt.customer.id, name: appt.customer.name, phone: appt.customer.phone } : preset?.customer || null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustHit[]>([]);
  const [isNew, setIsNew] = useState(false);
  const [nc, setNc] = useState({ name: "", phone: "", email: "", birthday: "", consent: false, marketing: false });

  // servicios
  const [rows, setRows] = useState<Row[]>(() => {
    if (appt) {
      return appt.items.map((it, i) => {
        const prev = appt.items[i - 1];
        const par = !!prev && new Date(it.start_at) < new Date(prev.end_at);
        return { key: rowKey++, id: it.id, service_id: String(it.service_id), professional_id: it.professional_id ? String(it.professional_id) : "",
          resource_id: it.resource_id ? String(it.resource_id) : "", parallel: par, offset: String(it.offset_min ?? 0) };
      });
    }
    return [{ key: rowKey++, service_id: preset?.serviceId ? String(preset.serviceId) : "", professional_id: preset?.professionalId ? String(preset.professionalId) : "", resource_id: "", parallel: false, offset: "0" }];
  });

  // día y hora
  const start0 = appt ? new Date(appt.start_at) : preset?.start || new Date();
  const [date, setDate] = useState(dayStr(start0));
  const [time, setTime] = useState(appt || preset?.start ? hhmm(start0) : "");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [notes, setNotes] = useState(appt?.notes || "");
  const [internal, setInternal] = useState(appt?.internal_notes || "");
  const [waive, setWaive] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [pin, setPin] = useState("");

  useEffect(() => {
    appApi<SvcOpt[]>("/services").then(setServices).catch((e) => setError(e.message));
    appApi<ProOpt[]>("/professionals").then(setPros).catch((e) => setError(e.message));
    if (hasResources) appApi<{ id: number; name: string; kind: string }[]>("/resources").then(setResources).catch(() => setResources([]));
  }, [hasResources]);

  // buscador de clientes
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = window.setTimeout(() => { appApi<CustHit[]>(`/customers/search?q=${encodeURIComponent(q.trim())}`).then(setHits).catch(() => setHits([])); }, 250);
  }, [q]);

  const svcById = useMemo(() => new Map(services.map((s) => [String(s.id), s])), [services]);
  const prosFor = (serviceId: string) => {
    const s = svcById.get(serviceId);
    const ids = new Set((s?.professionals || []).map((p) => p.professional_id));
    return pros.filter((p) => p.active && (ids.size === 0 || ids.has(p.id)));
  };
  const chosen = rows.filter((r) => r.service_id);
  const total = chosen.reduce((t, r) => t + (svcById.get(r.service_id)?.price || 0), 0);

  // horarios libres para el día elegido
  const idsKey = chosen.map((r) => `${r.service_id}:${r.professional_id}`).join(",");
  useEffect(() => {
    setSlots(null);
    if (!chosen.length || !date) return;
    const h = window.setTimeout(() => {
      const ex = appt ? `&exclude_appointment_id=${appt.id}` : "";
      appApi<{ days: { slots: Slot[] }[] }>(`/availability?service_ids=${idsKey}&date_from=${date}${ex}`)
        .then((r) => setSlots(r.days[0]?.slots || [])).catch(() => setSlots([]));
    }, 250);
    return () => window.clearTimeout(h);
  }, [idsKey, date, appt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const timeFree = slots !== null && time ? slots.some((s) => s.time === time) : null;

  async function submit(overbook = false) {
    setError("");
    if (!customer && !(isNew && nc.name.trim().length >= 2)) return setError("Elegí el cliente o cargá uno nuevo (nombre y teléfono)");
    if (isNew && !customer && !nc.phone.trim()) return setError("Poné el teléfono: lo necesitás para mandar los mensajes por WhatsApp");
    if (!chosen.length) return setError(`Elegí al menos un servicio`);
    if (!date || !time) return setError("Elegí el día y la hora");
    const start_at = toLocalISO(new Date(`${date}T${time}:00`));
    const items = chosen.map((r, i) => {
      const it: Record<string, unknown> = { service_id: Number(r.service_id), professional_id: r.professional_id ? Number(r.professional_id) : null };
      if (r.id) it.id = r.id;
      if (hasResources && r.resource_id) it.resource_id = Number(r.resource_id);
      if (i > 0 && r.parallel) it.offset_min = Math.max(0, Number(r.offset) || 0);
      return it;
    });
    setBusy(true);
    try {
      const common = { notes: strOrNull(notes), internal_notes: strOrNull(internal), overbook, pin: overbook && pin ? pin : undefined };
      if (editing && appt) {
        const res = await appApi<{ conflict?: boolean; reason?: string; appointment: Appt }>(`/appointments/${appt.id}?soft=1`, { method: "PUT", body: { start_at, items, ...common } });
        if (res.conflict) { setConflict(res.reason || "Ese horario no tiene lugar"); return; }
        onSaved({ appointment: res.appointment }, false);
      } else {
        const body = {
          customer_id: customer?.id, new_customer: customer ? undefined : { name: nc.name.trim(), phone: strOrNull(nc.phone), email: strOrNull(nc.email), birthday: nc.birthday || null, data_consent: nc.consent, marketing_opt_in: nc.marketing },
          items, start_at, source: "MANUAL", waive_deposit: waive, waitlist_id: preset?.waitlistId, ...common,
        };
        const res = await appApi<{ conflict?: boolean; reason?: string } & SavedResult>("/appointments?soft=1", { method: "POST", body });
        if (res.conflict) { setConflict(res.reason || "Ese horario no tiene lugar"); return; }
        onSaved(res, true);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }

  const needsPin = user?.role === "RECEPCION";
  const canOverbook = user?.role === "ADMINISTRADOR" || user?.role === "ENCARGADO" || user?.role === "RECEPCION";
  const today = dayStr(new Date());

  return (
    <Modal size="wide" eyebrow={editing ? "EDITAR" : "NUEVO"} title={editing ? `Editar ${v.turno}` : `Nuevo ${v.turno}`} onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Cerrar</button>
        <button className="primary-button" onClick={() => submit(false)} disabled={busy}>{busy ? "Guardando..." : editing ? "Guardar cambios" : `Guardar ${v.turno}`}</button></>}>
      <div className="g1-form">
        {error && <div className="g1-banner is-alert" role="alert"><div>{error}</div></div>}
        {conflict && (
          <div className="g1-banner is-warn" role="alert">
            <div>
              <strong>Ese horario no tiene lugar</strong>
              {conflict}
              {canOverbook ? (
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {needsPin && <input aria-label="PIN de un encargado" type="password" inputMode="numeric" maxLength={6} placeholder="PIN de encargado" value={pin} onChange={(e) => setPin(e.target.value)}
                    style={{ width: 150, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--tn-orange-text)", background: "var(--tn-surface)", color: "var(--tn-ink)" }} />}
                  <button className="primary-button g1-small" onClick={() => submit(true)} disabled={busy || (needsPin && pin.length < 4)}>Hacer sobreturno igual</button>
                  <small style={{ color: "var(--tn-ink)" }}>Queda marcado y registrado{needsPin ? ". Recepción necesita el PIN de un encargado" : ""}.</small>
                </div>
              ) : <small>Elegí otro horario.</small>}
            </div>
          </div>
        )}

        <div className="g1-section">
          <h3>Cliente</h3>
          {customer ? (
            <div className="g1-item" style={{ padding: "8px 12px" }}>
              <div className="g1-item-main"><strong>{customer.name}</strong><small>{customer.phone || "Sin teléfono"}</small></div>
              {!editing && <button className="secondary-button g1-small" onClick={() => { setCustomer(null); setQ(""); }}>Cambiar</button>}
            </div>
          ) : isNew ? (
            <div className="g1-form-grid">
              <Field label="Nombre y apellido"><input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} autoFocus /></Field>
              <Field label="Teléfono (para WhatsApp)" hint="Con código de área, por ejemplo 261 555 1234"><input inputMode="tel" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} /></Field>
              <Field label="Fecha de nacimiento (opcional)"><input type="date" value={nc.birthday} max={today} onChange={(e) => setNc({ ...nc, birthday: e.target.value })} /></Field>
              <Field label="Email (opcional)"><input type="email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} /></Field>
              <label className="g1-check" style={{ gridColumn: "1 / -1" }}><input type="checkbox" checked={nc.consent} onChange={(e) => setNc({ ...nc, consent: e.target.checked })} />
                <span>El cliente aceptó que guardemos sus datos para gestionar sus {v.turnos}<small>Ley 25.326. Si no quiere, podés cargar el {v.turno} igual.</small></span></label>
              <label className="g1-check" style={{ gridColumn: "1 / -1" }}><input type="checkbox" checked={nc.marketing} onChange={(e) => setNc({ ...nc, marketing: e.target.checked })} />
                <span>Quiere recibir saludos de cumpleaños y novedades<small>Si no lo tildás, solo le escribimos por sus {v.turnos}.</small></span></label>
              <div><button className="secondary-button g1-small" onClick={() => setIsNew(false)}>Buscar uno existente</button></div>
            </div>
          ) : (
            <>
              <div className="tn-row">
                <div className="form-group" style={{ flex: 1, minWidth: 220 }}>
                  <label htmlFor="g1-q">Buscar por nombre, teléfono o DNI</label>
                  <input id="g1-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribí al menos 2 letras" autoFocus autoComplete="off" />
                </div>
                <button className="secondary-button" onClick={() => { setIsNew(true); setNc((n) => ({ ...n, name: q })); }}><Icon name="plus" size={14} /> Cliente nuevo</button>
              </div>
              {hits.length > 0 && (
                <div className="g1-results" role="listbox">
                  {hits.map((h) => (
                    <button key={h.id} type="button" onClick={() => setCustomer({ id: h.id, name: h.name, phone: h.phone })}>
                      <span><b>{h.name}</b> <small>{h.phone || "sin teléfono"}</small></span>
                      <span>{h.health_alert && <Pill tone="red">Alertas de salud</Pill>} {h.no_show_count > 0 && <Pill tone="orange">{h.no_show_count} ausencia(s)</Pill>} {h.blocked_online && <Pill tone="gray">Sin web</Pill>}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="g1-section">
          <h3>Servicios</h3>
          {rows.map((r, i) => (
            <div key={r.key} className="tn-stack" style={{ gap: 6 }}>
              <div className="g1-row">
                <div className="form-group"><label htmlFor={`sv${r.key}`}>{i === 0 ? "Servicio" : `Servicio ${i + 1}`}</label>
                  <select id={`sv${r.key}`} value={r.service_id} onChange={(e) => setRow(r.key, { service_id: e.target.value, professional_id: "" })}>
                    <option value="">Elegí…</option>
                    {services.filter((s) => s.active || String(s.id) === r.service_id).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.duration_min} min · {money(s.price)}</option>)}
                  </select></div>
                <div className="form-group"><label htmlFor={`pr${r.key}`}>Con quién</label>
                  <select id={`pr${r.key}`} value={r.professional_id} onChange={(e) => setRow(r.key, { professional_id: e.target.value })}>
                    <option value="">Cualquiera (el primero libre)</option>
                    {prosFor(r.service_id).map((p) => <option key={p.id} value={p.id}>{proName(p)}</option>)}
                  </select></div>
                {rows.length > 1 ? <button className="secondary-button g1-small" aria-label="Sacar este servicio" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Icon name="trash" size={14} /></button> : <span />}
              </div>
              <div className="tn-row" style={{ gap: 14 }}>
                {hasResources && (
                  <div className="form-group" style={{ margin: 0 }}><label htmlFor={`rc${r.key}`} className="tn-muted">Recurso</label>
                    <select id={`rc${r.key}`} value={r.resource_id} onChange={(e) => setRow(r.key, { resource_id: e.target.value })} style={{ height: 38 }}>
                      <option value="">Automático</option>
                      {resources.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select></div>
                )}
                {i > 0 && (
                  <label className="g1-check"><input type="checkbox" checked={r.parallel} onChange={(e) => setRow(r.key, { parallel: e.target.checked })} />
                    <span>Al mismo tiempo que los anteriores<small>Con otra persona, mientras el primero espera (por ejemplo la pose).</small></span></label>
                )}
                {i > 0 && r.parallel && (
                  <div className="form-group" style={{ margin: 0 }}><label htmlFor={`of${r.key}`} className="tn-muted">Empieza a los (min)</label>
                    <input id={`of${r.key}`} type="number" min={0} max={600} value={r.offset} onChange={(e) => setRow(r.key, { offset: e.target.value })} style={{ width: 90, height: 38 }} /></div>
                )}
              </div>
            </div>
          ))}
          {rows.length < 6 && <div><button className="secondary-button g1-small" onClick={() => setRows((rs) => [...rs, { key: rowKey++, service_id: "", professional_id: "", resource_id: "", parallel: false, offset: "0" }])}><Icon name="plus" size={14} /> Agregar otro servicio</button></div>}
          {chosen.length > 0 && <small className="tn-muted">Total: <b>{money(total)}</b> · {chosen.reduce((t, r) => t + (svcById.get(r.service_id)?.duration_min || 0), 0)} min en total</small>}
        </div>

        <div className="g1-section">
          <h3>Día y hora</h3>
          <div className="g1-form-grid">
            <Field label="Día"><input type="date" value={date} onChange={(e) => { setDate(e.target.value); setConflict(null); }} /></Field>
            <Field label="Hora" hint={timeFree === false ? "Ese horario no figura libre: si lo guardás, vas a poder hacerlo como sobreturno." : undefined}>
              <input type="time" step={900} value={time} onChange={(e) => { setTime(e.target.value); setConflict(null); }} /></Field>
          </div>
          {chosen.length > 0 && (
            <div>
              <small className="tn-muted">Horarios libres ese día (los servicios van uno después del otro)</small>
              {slots === null ? <div className="tn-muted">Buscando…</div> : slots.length === 0 ? <div className="tn-muted">No hay horarios libres ese día. Probá con otro día o con otra persona.</div> : (
                <div className="g1-slots" style={{ marginTop: 6 }}>{slots.map((s) => <button key={s.start_at} type="button" className={`g1-slot ${s.time === time ? "is-on" : ""}`} onClick={() => { setTime(s.time); setConflict(null); }}>{s.time}</button>)}</div>
              )}
            </div>
          )}
        </div>

        <div className="g1-form-grid">
          <Field label="Nota del turno" hint="La puede ver el cliente en su link"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>
          <Field label="Nota interna" hint="Solo el equipo"><textarea value={internal} onChange={(e) => setInternal(e.target.value)} maxLength={500} /></Field>
        </div>
        {!editing && (
          <label className="g1-check"><input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} />
            <span>No pedir la seña en este {v.turno}<small>Si el servicio la pide, queda registrado que se cargó sin seña.</small></span></label>
        )}
      </div>
    </Modal>
  );
}
