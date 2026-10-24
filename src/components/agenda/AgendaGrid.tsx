// Grilla de la agenda: columnas por profesional (día) o por día (semana). Fases con pose rayadas, arrastrar para mover, clic en un hueco para crear.
import { useMemo, useRef, useState } from "react";
import type { DragEvent, MouseEvent } from "react";
import Icon from "../Icons";
import { dayKey, hhmm, shortDate } from "../../config";
import { ALERT_ICON, STATUS_LABEL, minutesOf, fmtMin, shortName } from "./types";
import type { AgendaData, Appt, ApptItem, Block } from "./types";

const PPM = 1.15;                         // píxeles por minuto
const MOVABLE = ["PENDIENTE_SENIA", "CONFIRMADO", "EN_SALA"];

interface Col { key: string; day: string; proId: number | null; title: string; sub: string; today: boolean }
interface RB { appt: Appt; item: ApptItem; block: Block; start: number; end: number; first: boolean; lane: number; lanes: number; narrow: boolean; kind: Block["kind"] }

export interface MoveInfo { appt: Appt; item: ApptItem; start: Date; toProId: number | null }
export interface CreateInfo { start: Date; proId: number | null }

function parseDay(k: string) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }
const DAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function layoutColumn(blocks: RB[]) {
  const solid = blocks.filter((b) => b.kind !== "ESPERA").sort((a, b) => a.start - b.start || b.end - a.end);
  const waits = blocks.filter((b) => b.kind === "ESPERA");
  let cluster: RB[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes: number[] = [];
    for (const b of cluster) {
      let i = lanes.findIndex((e) => e <= b.start);
      if (i === -1) { lanes.push(0); i = lanes.length - 1; }
      lanes[i] = b.end;
      b.lane = i;
    }
    cluster.forEach((b) => { b.lanes = lanes.length; });
    cluster = [];
  };
  for (const b of solid) {
    if (cluster.length && b.start >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  if (cluster.length) flush();
  for (const b of solid) {
    if (b.kind === "ACTIVA" && waits.some((w) => w.item.id !== b.item.id && w.start < b.end && b.start < w.end)) b.narrow = true;
  }
  return [...waits, ...solid];
}

export default function AgendaGrid({ data, canDrag, onOpen, onCreate, onMove }: {
  data: AgendaData; canDrag: boolean; onOpen: (a: Appt) => void; onCreate: (c: CreateInfo) => void; onMove: (m: MoveInfo) => void;
}) {
  const todayKey = dayKey(new Date());
  const week = data.view === "week";
  const slot = data.settings.slot_minutes || 15;

  const cols: Col[] = useMemo(() => {
    if (!week) return data.professionals.map((p) => ({ key: `p${p.id}`, day: data.date, proId: p.id, title: p.name, sub: p.role_label || "", today: data.date === todayKey }));
    const pro = data.professionals[0];
    const out: Col[] = [];
    for (let d = parseDay(data.from); dayKey(d) <= data.to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const k = dayKey(d);
      out.push({ key: k, day: k, proId: pro ? pro.id : null, title: `${DAY_SHORT[d.getDay()]} ${d.getDate()}`, sub: pro ? pro.name : "", today: k === todayKey });
    }
    return out;
  }, [data, week, todayKey]);

  // rango horario: lo que atienden los profesionales y lo que tenga turnos
  const [axisStart, axisEnd] = useMemo(() => {
    let lo = 24 * 60, hi = 0;
    for (const p of data.professionals) for (const slots of Object.values(p.hours)) for (const [a, b] of slots) { lo = Math.min(lo, a); hi = Math.max(hi, b); }
    for (const a of data.appointments) for (const it of a.items) for (const b of it.blocks) { lo = Math.min(lo, minutesOf(b.start_at)); hi = Math.max(hi, minutesOf(b.end_at) || 24 * 60); }
    if (lo >= hi) { lo = 9 * 60; hi = 19 * 60; }
    return [Math.max(0, Math.floor(lo / 60) * 60 - 0), Math.min(24 * 60, Math.ceil(hi / 60) * 60)];
  }, [data]);
  const height = (axisEnd - axisStart) * PPM;

  const blocksByCol = useMemo(() => {
    const out: Record<string, RB[]> = {};
    for (const c of cols) out[c.key] = [];
    for (const a of data.appointments) {
      for (const it of a.items) {
        const bl = [...it.blocks].sort((x, y) => x.start_at.localeCompare(y.start_at));
        let firstDone = false;
        for (const b of bl) {
          const col = cols.find((c) => c.proId === it.professional_id && c.day === b.start_at.slice(0, 10));
          if (!col) continue;
          const first = b.kind === "ACTIVA" && !firstDone;
          if (first) firstDone = true;
          const s = minutesOf(b.start_at);
          const e = Math.max(s + 5, (minutesOf(b.end_at) || 24 * 60));
          out[col.key].push({ appt: a, item: it, block: b, start: s, end: e, first, lane: 0, lanes: 1, narrow: false, kind: b.kind });
        }
      }
    }
    for (const k of Object.keys(out)) out[k] = layoutColumn(out[k]);
    return out;
  }, [data, cols]);

  // arrastrar
  const drag = useRef<{ appt: Appt; item: ApptItem; grab: number } | null>(null);
  const [ghost, setGhost] = useState<{ col: string; top: number; h: number } | null>(null);

  function minutesAt(e: { clientY: number }, el: HTMLElement): number {
    const rect = el.getBoundingClientRect();
    return axisStart + (e.clientY - rect.top) / PPM;
  }
  const snap = (m: number) => Math.round(m / slot) * slot;

  function colClick(e: MouseEvent<HTMLDivElement>, col: Col) {
    if (!data.can_write) return;
    const m = Math.floor(minutesAt(e, e.currentTarget) / slot) * slot;
    const d = parseDay(col.day);
    d.setMinutes(m);
    onCreate({ start: d, proId: col.proId });
  }
  function onDragStart(e: DragEvent<HTMLButtonElement>, rb: RB) {
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = { appt: rb.appt, item: rb.item, grab: (e.clientY - rect.top) / PPM };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(rb.appt.id));
  }
  function onDragOver(e: DragEvent<HTMLDivElement>, col: Col) {
    if (!drag.current) return;
    e.preventDefault();
    const m = snap(minutesAt(e, e.currentTarget) - drag.current.grab);
    const dur = minutesOf(drag.current.item.end_at) - minutesOf(drag.current.item.start_at) || 30;
    setGhost({ col: col.key, top: (m - axisStart) * PPM, h: Math.max(18, dur * PPM) });
  }
  function onDrop(e: DragEvent<HTMLDivElement>, col: Col) {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d) return;
    e.preventDefault();
    const m = snap(minutesAt(e, e.currentTarget) - d.grab);
    const start = parseDay(col.day);
    start.setMinutes(m);
    const same = new Date(d.item.start_at).getTime() === start.getTime() && d.item.professional_id === col.proId;
    if (!same) onMove({ appt: d.appt, item: d.item, start, toProId: col.proId });
  }

  const nowMin = (() => { const n = new Date(data.now); return n.getHours() * 60 + n.getMinutes(); })();
  const hourMarks: number[] = [];
  for (let m = axisStart; m <= axisEnd; m += 30) hourMarks.push(m);

  if (!cols.length) {
    return <div className="tn-empty"><strong>No hay columnas para mostrar</strong>Cargá {"profesionales"} en Servicios y equipo o elegí otro filtro.</div>;
  }

  return (
    <div className="g1-grid" style={{ ["--g1-cols" as string]: cols.length }} data-tour="agenda-grid">
      <div className="g1-gh">Hora</div>
      {cols.map((c) => (
        <div key={c.key} className={`g1-gh ${c.today ? "is-today" : ""}`}>
          <strong>{!week && <span className="g1-dot" style={{ background: data.professionals.find((p) => p.id === c.proId)?.color || "var(--tn-brand-c)" }} aria-hidden="true" />}{c.title}</strong>
          <small>{week ? (c.today ? "Hoy" : shortDate(c.day)) : c.sub || " "}</small>
        </div>
      ))}
      <div className="g1-time" style={{ height }}>
        {hourMarks.filter((m) => m % 60 === 0 && m < axisEnd).map((m) => <span key={m} style={{ top: (m - axisStart) * PPM + 8 }}>{fmtMin(m)}</span>)}
      </div>
      {cols.map((c) => {
        const pro = data.professionals.find((p) => p.id === c.proId);
        const wd = String((parseDay(c.day).getDay() + 6) % 7);
        const slots = (pro?.hours[wd] || []).slice().sort((a, b) => a[0] - b[0]);
        const closed = data.closed.find((x) => x.date === c.day && (x.professional_id === null || x.professional_id === c.proId));
        const offs: { from: number; to: number; label?: string; leave?: boolean }[] = [];
        if (closed || !slots.length) offs.push({ from: axisStart, to: axisEnd, label: closed ? `Cerrado${closed.reason ? ": " + closed.reason : ""}` : "No atiende" });
        else {
          let cur = axisStart;
          for (const [a, b] of slots) { if (a > cur) offs.push({ from: cur, to: Math.min(a, axisEnd) }); cur = Math.max(cur, b); }
          if (cur < axisEnd) offs.push({ from: cur, to: axisEnd });
        }
        for (const t of data.time_off) {
          if (t.professional_id !== c.proId) continue;
          const dayStart = parseDay(c.day).getTime(), dayEnd = dayStart + 86400000;
          const f = new Date(t.from_at).getTime(), to = new Date(t.to_at).getTime();
          if (to <= dayStart || f >= dayEnd) continue;
          const a = f <= dayStart ? axisStart : Math.max(axisStart, minutesOf(t.from_at));
          const b = to >= dayEnd ? axisEnd : Math.min(axisEnd, minutesOf(t.to_at));
          if (b > a) offs.push({ from: a, to: b, leave: true, label: t.kind === "VACACIONES" ? "Vacaciones" : t.kind === "LICENCIA" ? "Licencia" : t.reason || "Bloqueado" });
        }
        return (
          <div key={c.key} className={`g1-col ${data.can_write ? "" : "is-readonly"}`} style={{ height }} onClick={(e) => colClick(e, c)}
            onDragOver={(e) => onDragOver(e, c)} onDragLeave={() => setGhost((g) => (g && g.col === c.key ? null : g))} onDrop={(e) => onDrop(e, c)}
            aria-label={`Columna de ${c.title}`}>
            {hourMarks.map((m) => <div key={m} className={`g1-line ${m % 60 === 0 ? "is-hour" : ""}`} style={{ top: (m - axisStart) * PPM }} />)}
            {offs.map((o, i) => <div key={i} className={`g1-off ${o.leave ? "is-leave" : ""}`} style={{ top: (o.from - axisStart) * PPM, height: (o.to - o.from) * PPM }}>{o.label && <span>{o.label}</span>}</div>)}
            {c.today && nowMin >= axisStart && nowMin <= axisEnd && <div className="g1-now" style={{ top: (nowMin - axisStart) * PPM }} aria-hidden="true" />}
            {ghost && ghost.col === c.key && <div className="g1-drop" style={{ top: ghost.top, height: ghost.h }} />}
            {(blocksByCol[c.key] || []).map((rb, i) => {
              const top = (rb.start - axisStart) * PPM;
              const h = Math.max(rb.kind === "BUFFER" ? 6 : 20, (rb.end - rb.start) * PPM - 1);
              const pct = 100 / rb.lanes;
              const style = {
                top, height: h, left: `calc(${pct * rb.lane}% + 2px)`, width: `calc(${pct}% - 4px - ${rb.narrow ? 20 : 0}px)`,
                borderLeftColor: rb.item.color || undefined,
              } as const;
              const a = rb.appt;
              const movable = canDrag && !a.readonly && MOVABLE.includes(a.status) && rb.first;
              if (rb.kind === "BUFFER") return <div key={i} className="g1-blk is-buffer" style={style} title="Limpieza y preparación" aria-hidden="true" />;
              if (rb.kind === "ESPERA") {
                return (
                  <button key={i} type="button" className="g1-blk is-wait" style={{ ...style, width: "calc(100% - 4px)", left: 2 }} onClick={(e) => { e.stopPropagation(); onOpen(a); }}
                    title="Tiempo de espera (pose): el profesional queda libre">
                    <strong>{shortName(a.customer?.name || "")} · pose</strong>
                  </button>
                );
              }
              const alerts = a.alerts.filter((x) => x.key !== "no_shows" || (a.customer?.no_show_count || 0) > 0);
              return (
                <button key={i} type="button" draggable={movable} onDragStart={(e) => movable && onDragStart(e, rb)} onDragEnd={() => { drag.current = null; setGhost(null); }}
                  className={`g1-blk st-${a.status} ${a.overbooked ? "is-over" : ""} ${a.readonly ? "is-readonly" : ""} ${rb.first ? "" : "is-cont"}`} style={style}
                  onClick={(e) => { e.stopPropagation(); onOpen(a); }}
                  aria-label={`${a.customer?.name || "Turno"}, ${rb.item.name}, ${hhmm(rb.block.start_at)}, ${STATUS_LABEL[a.status] || a.status}`}>
                  <strong>
                    {rb.first ? hhmm(rb.item.start_at) + " " : "↳ "}{shortName(a.customer?.name || "Sin cliente")}
                    {rb.first && alerts.length > 0 && (
                      <span className="g1-ind">{alerts.slice(0, 4).map((al) => (
                        <span key={al.key} title={al.label} className={al.key === "alergia" || al.key === "menor" ? "is-red" : al.key === "sena_pendiente" || al.key === "no_shows" ? "is-orange" : "is-blue"}>
                          <Icon name={ALERT_ICON[al.key] || "alert"} size={12} />
                        </span>
                      ))}</span>
                    )}
                  </strong>
                  {h > 34 && <small>{rb.item.name}{a.items.length > 1 ? " · combo" : ""}</small>}
                  {h > 52 && <small>{STATUS_LABEL[a.status] || a.status}</small>}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
