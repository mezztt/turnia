// Agenda (G1): grilla por profesional (día) o por día (semana), turnos con varios servicios, sobreturnos, lista de espera y mensajes del día.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { addDays, appApi, dayKey, getSessionUser, hhmm, longDate, parseDay, toLocalISO, vocab, cap } from "../../../config";
import { Loading, Modal, PageHeader, Seg, Tabs, useFlash, useRefreshKey } from "../../../components/ui";
import Icon from "../../../components/Icons";
import AgendaGrid from "../../../components/agenda/AgendaGrid";
import type { CreateInfo, MoveInfo } from "../../../components/agenda/AgendaGrid";
import AppointmentForm from "../../../components/agenda/AppointmentForm";
import type { FormPreset, SavedResult } from "../../../components/agenda/AppointmentForm";
import AppointmentDetail from "../../../components/agenda/AppointmentDetail";
import MensajesDia from "../../../components/agenda/MensajesDia";
import ListaEspera from "../../../components/agenda/ListaEspera";
import { openWa, STATUS_LABEL } from "../../../components/agenda/types";
import type { AgendaData, Appt } from "../../../components/agenda/types";
import "../../../g1.css";

type Tab = "agenda" | "mensajes" | "espera";
type View = "day" | "week";

export default function AgendaPage() {
  const flash = useFlash();
  const refresh = useRefreshKey();
  const user = getSessionUser();
  const v = vocab(user);
  const [params, setParams] = useSearchParams();
  const tab = (["agenda", "mensajes", "espera"].includes(params.get("tab") || "") ? params.get("tab") : "agenda") as Tab;
  const [day, setDay] = useState(() => params.get("fecha") || dayKey(new Date()));
  const [view, setView] = useState<View>("day");
  const [hidden, setHidden] = useState<number[]>([]);
  const [data, setData] = useState<AgendaData | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [form, setForm] = useState<{ appt?: Appt; preset?: FormPreset } | null>(null);
  const [sent, setSent] = useState<SavedResult | null>(null);
  const [move, setMove] = useState<{ info: MoveInfo; reason: string; pin: string } | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(() => {
    const ids = hidden.length && data ? data.professionals.filter((p) => !hidden.includes(p.id)).map((p) => p.id).join(",") : "";
    return appApi<AgendaData>(`/agenda?date=${day}&view=${view}${ids ? `&professional_ids=${ids}` : ""}`)
      .then((d) => { setData(d); setError(""); }).catch((e) => setError(e.message));
  }, [day, view, hidden, tick, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  // se refresca solo cada minuto (la línea de «ahora», señas vencidas, turnos de la web)
  useEffect(() => { const t = window.setInterval(() => setTick((n) => n + 1), 60000); return () => window.clearInterval(t); }, []);

  const reload = () => setTick((n) => n + 1);
  const setTab = (t: Tab) => { const p = new URLSearchParams(params); if (t === "agenda") p.delete("tab"); else p.set("tab", t); setParams(p, { replace: true }); };
  const shift = (n: number) => setDay(dayKey(addDays(parseDay(day), view === "week" ? n * 7 : n)));
  const proNames = useMemo(() => Object.fromEntries((data?.professionals || []).map((p) => [p.id, p.name])), [data]);
  const shown = useMemo(() => (data ? { ...data, professionals: data.professionals.filter((p) => !hidden.includes(p.id)) } : null), [data, hidden]);
  const toggle = (id: number) => setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  const write = !!data?.can_write;

  async function doMove(m: MoveInfo, overbook = false, pin = "") {
    const a = m.appt;
    const delta = m.start.getTime() - new Date(m.item.start_at).getTime();
    const start = new Date(new Date(a.start_at).getTime() + delta);
    const items = a.items.map((it, i) => {
      const o: Record<string, unknown> = { id: it.id, service_id: it.service_id, professional_id: it.id === m.item.id && m.toProId ? m.toProId : it.professional_id, resource_id: it.resource_id };
      if (i > 0 && it.offset_min !== null) o.offset_min = it.offset_min;
      return o;
    });
    try {
      const r = await appApi<{ conflict?: boolean; reason?: string }>(`/appointments/${a.id}?soft=1`, { method: "PUT", body: { start_at: toLocalISO(start), items, overbook, pin: overbook && pin ? pin : undefined } });
      if (r.conflict) { setMove({ info: m, reason: r.reason || "Ese horario no tiene lugar", pin }); return; }
      setMove(null);
      flash.show(`${cap(v.turno)} movido a las ${hhmm(start)}`);
      reload();
    } catch (e) { flash.fail(e); setMove(null); }
  }

  function created(r: SavedResult, isNew: boolean) {
    setForm(null); reload();
    if (isNew && r.message?.wa_url) setSent(r); else flash.show(isNew ? `${cap(v.turno)} guardado` : "Cambios guardados");
  }

  const title = view === "day" ? longDate(parseDay(day)) : data ? `${longDate(parseDay(data.from))} al ${longDate(parseDay(data.to))}` : "";
  const isToday = day === dayKey(new Date());

  return (
    <div data-tour="agenda">
      <PageHeader eyebrow="AGENDA" title="Agenda" subtitle={`Los ${v.turnos} del día por ${v.profesional}, con sus fases y las esperas.`}>
        {write && <button className="primary-button" data-tour="agenda-nuevo" onClick={() => setForm({ preset: {} })}><Icon name="plus" size={16} /> Nuevo {v.turno}</button>}
      </PageHeader>
      <Tabs value={tab} onChange={setTab} options={[["agenda", "Agenda"], ...(write ? [["mensajes", "Mensajes del día"], ["espera", "Lista de espera"]] as [Tab, string][] : [])]} />
      <div style={{ marginTop: 16 }}>
        {tab === "agenda" && (<>
          <div className="g1-bar">
            <div className="g1-bar-group">
              <div className="g1-date">
                <button className="g1-icon-btn" onClick={() => shift(-1)} aria-label={view === "day" ? "Día anterior" : "Semana anterior"}><Icon name="chevronLeft" size={16} /></button>
                <strong>{title}</strong>
                <button className="g1-icon-btn" onClick={() => shift(1)} aria-label={view === "day" ? "Día siguiente" : "Semana siguiente"}><Icon name="chevronRight" size={16} /></button>
              </div>
              <button className="secondary-button" onClick={() => setDay(dayKey(new Date()))} disabled={isToday}>Hoy</button>
              <input type="date" aria-label="Ir a un día" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="g1-datepick" />
            </div>
            <Seg<View> value={view} onChange={setView} options={[["day", "Día"], ["week", "Semana"]]} />
          </div>
          {data && data.professionals.length > 1 && (
            <div className="g1-bar-group" style={{ marginBottom: 12 }} role="group" aria-label={`Filtrar por ${v.profesional}`}>
              {data.professionals.map((p) => (
                <button key={p.id} className={`g1-chip ${hidden.includes(p.id) ? "" : "is-on"}`} aria-pressed={!hidden.includes(p.id)} onClick={() => toggle(p.id)}>
                  <i style={{ background: p.color || "var(--tn-brand)" }} />{p.name}
                </button>
              ))}
            </div>
          )}
          {error && <div className="g1-banner is-alert" role="alert"><div>{error}</div></div>}
          {!shown ? (!error && <Loading />) : shown.professionals.length === 0 ? (
            <div className="g1-banner is-info"><div><strong>No hay {v.profesionales} para mostrar</strong>Cargá {v.profesionales} y sus horarios en Servicios, o activá alguno de los filtros.</div></div>
          ) : (
            <AgendaGrid data={shown} canDrag={write} onOpen={(a) => setOpenId(a.id)}
              onCreate={(c: CreateInfo) => write && setForm({ preset: { start: c.start, professionalId: c.proId } })}
              onMove={(m) => doMove(m)} />
          )}
          <div className="g1-legend" aria-label="Referencias">
            {["PENDIENTE_SENIA", "CONFIRMADO", "EN_SALA", "EN_CURSO", "FINALIZADO", "NO_SHOW"].map((s) => <span key={s}><i className={`g1-blk st-${s}`} style={{ position: "static" }} />{STATUS_LABEL[s]}</span>)}
            <span><i className="g1-blk is-wait" style={{ position: "static" }} />Espera (la persona queda libre)</span>
          </div>
        </>)}
        {tab === "mensajes" && <MensajesDia date={dayKey(new Date())} flash={flash} onChanged={reload} />}
        {tab === "espera" && <ListaEspera flash={flash} onSchedule={(e) => setForm({ preset: { customer: e.customer_id ? { id: e.customer_id, name: e.name, phone: e.phone } : undefined, serviceId: e.service_id || undefined, waitlistId: e.id } })} />}
      </div>

      {openId !== null && data && (
        <AppointmentDetail id={openId} proNames={proNames} graceMin={data.settings.no_show_grace_min} freeHours={data.settings.cancel_free_hours} flash={flash}
          onClose={() => setOpenId(null)} onChanged={reload} onEdit={(a) => { setOpenId(null); setForm({ appt: a }); }} />
      )}
      {form && <AppointmentForm appt={form.appt} preset={form.preset} onClose={() => setForm(null)} onSaved={created} />}
      {sent && (
        <Modal title={`${cap(v.turno)} guardado`} onClose={() => setSent(null)}
          footer={<><button className="secondary-button" onClick={() => setSent(null)}>Listo</button>
            <button className="primary-button" onClick={() => { openWa(sent.message?.wa_url); setSent(null); }}><Icon name="message" size={16} /> Mandar confirmación por WhatsApp</button></>}>
          <p style={{ marginTop: 0 }}>Se abre WhatsApp con el mensaje listo; lo mandás vos.</p>
          <div className="g1-banner is-info"><div style={{ whiteSpace: "pre-wrap" }}>{sent.message?.text}</div></div>
        </Modal>
      )}
      {move && (
        <Modal title="Ese horario no tiene lugar" onClose={() => setMove(null)}
          footer={<><button className="secondary-button" onClick={() => setMove(null)}>Dejarlo donde estaba</button>
            {data?.can_write && <button className="primary-button" onClick={() => doMove(move.info, true, move.pin)} disabled={!data.can_overbook_alone && move.pin.length < 4}>Hacer sobreturno igual</button>}</>}>
          <p style={{ marginTop: 0 }}>{move.reason}</p>
          {!data?.can_overbook_alone && (
            <label className="g1-check"><span>PIN de un encargado</span>
              <input type="password" inputMode="numeric" maxLength={6} value={move.pin} onChange={(e) => setMove({ ...move, pin: e.target.value })} /></label>
          )}
        </Modal>
      )}
      {flash.node}
    </div>
  );
}
