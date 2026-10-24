import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { appApi, canAccess, addDays, cap, dayKey, dayLabel, hhmm, longDate, money, NAV, PAYMENT_METHODS, shortDate, timeRange, vocab } from "../config";
import type { SessionUser, Vocabulary } from "../config";
import { STATUS_LABEL } from "./agenda/types";
import { TurniaLogo } from "./Brand";

/**
 * Asistente de Turnia.
 * Responde con datos reales del local (turnos, huecos, cobros, pendientes…) consultando la API del propio sistema
 * y explica cómo hacer cada cosa. Funciona por reglas: no usa IA externa ni tiene costo.
 * Respeta el plan y el rol (canAccess). Las fichas, la salud y los consentimientos NUNCA se muestran en el chat.
 */

interface Msg {
  from: "bot" | "user";
  text: string;
  actions?: { label: string; to: string }[];
  quick?: string[];
}

interface Ctx { user: SessionUser; v: Vocabulary; can: (m: string) => boolean; front: boolean; boss: boolean }

// ---------- tipos de las respuestas de la API ----------
interface AgAppt {
  id: number; start_at: string; end_at: string; status: string;
  customer: { name: string } | null; items: { name: string; professional_id: number | null }[];
}
interface AgResp {
  date: string;
  professionals: { id: number; name: string; hours: Record<string, number[][]> }[];
  appointments: AgAppt[];
  time_off: { professional_id: number; from_at: string; to_at: string }[];
  closed: { date: string; professional_id: number | null; reason: string | null }[];
}
interface Svc { id: number; name: string; duration_min: number }
interface Pro { id: number; name: string; display_name: string | null }
interface Slots { days: { date: string; slots: { time: string }[] }[] }
interface DaySummary {
  appointments_today?: number; sales_today?: number; birthdays_today?: number;
}
interface PendingItem { key: string; label: string; count: number; path: string; hint: string }
interface CashDay { sales_count: number; sales_total: number; tips_total: number; by_method: Record<string, number>; voided_count: number }
interface ToCollect { appointment_id: number; start_at: string; customer_name: string; total: number; deposit_paid: number; sale_id: number | null }
interface Cust { id: number; name: string; birthday: string | null; last_visit_at: string | null }
interface Product { name: string; stock_qty: number; min_qty: number; unit: string | null }
interface Expiring {
  memberships: { customer_name: string | null; plan_name: string | null; days_left: number | null }[];
  packs: { customer_name: string | null; name: string; days_left: number | null; sessions_left: number }[];
}
interface Bio {
  alerts: { tone: string; text: string }[];
  cleaning: { name: string; times_today: number }[];
}

// ---------- texto ----------
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[¿?¡!.,;:()«»"]/g, " ").replace(/\s+/g, " ").trim();

/** distancia de edición con transposiciones: «tunros» está a 1 de «turnos» */
function lev(a: string, b: string): number {
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** ¿la frase contiene la clave? Frases: coincidencia exacta. Palabras: por prefijo o con hasta 1-2 errores de tipeo. */
const NO_FUZZY = ["como", "donde", "cuando", "cuanto", "para", "pero", "algo", "esto", "esta", "estan", "tengo", "tiene", "hacer", "mucho", "cosas", "todos", "todas"];
function hit(t: string, tokens: string[], key: string): boolean {
  if (key.includes(" ")) return t.includes(key);
  return tokens.some((w) => {
    if (w.startsWith(key)) return true;
    if (key.length < 5 || w.length < 4 || Math.abs(w.length - key.length) > 2 || NO_FUZZY.includes(w)) return false;
    return lev(w.slice(0, key.length + 1), key) <= (key.length >= 8 ? 2 : 1) || lev(w, key) <= (key.length >= 8 ? 2 : 1);
  });
}
const score = (t: string, tokens: string[], keys: string[]) => keys.reduce((s, k) => s + (hit(t, tokens, k) ? k.length + (k.includes(" ") ? 5 : 0) : 0), 0);

const HOW = ["como", "donde", "que hago", "ayuda", "se puede", "paso a paso", "configur", "explic", "tutorial", "no se"];

function dayOffset(t: string): number {
  if (t.includes("pasado manana")) return 2;
  if (/\bmanana\b/.test(t)) return 1;
  return 0;
}
const dayWord = (n: number) => (n === 0 ? "hoy" : n === 1 ? "mañana" : "pasado mañana");
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const minLabel = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const pathLabel = (p: string) => NAV.find((n) => n.path === p)?.label;
const go = (to: string, label?: string) => ({ label: label || `Ir a ${pathLabel(to) || "la pantalla"}`, to });

// =====================================================================
// CONSULTAS DE DATOS (solo endpoints que existen)
// =====================================================================
interface DataIntent {
  id: string;
  keys: string[];
  allowed: (c: Ctx) => boolean;
  denied: string;
  run: (c: Ctx, t: string, tokens: string[]) => Promise<Msg>;
}

async function loadAgenda(offset: number): Promise<AgResp> {
  return appApi<AgResp>(`/agenda?date=${dayKey(addDays(new Date(), offset))}`);
}
const proName = (r: AgResp, id: number | null | undefined) => r.professionals.find((p) => p.id === id)?.name;
function apptLine(r: AgResp, a: AgAppt, withStatus = true) {
  const who = proName(r, a.items[0]?.professional_id);
  const what = a.items.map((i) => i.name).join(" + ");
  return `• ${timeRange(a.start_at, a.end_at)} · ${a.customer?.name || "Sin nombre"}${what ? ` · ${what}` : ""}${who ? ` (${who})` : ""}${withStatus ? ` — ${STATUS_LABEL[a.status] || a.status}` : ""}`;
}

function dataIntents(v: Vocabulary): DataIntent[] {
  const agendaOk = (c: Ctx) => c.can("agenda");
  const noAgenda = "Tu plan no incluye la Agenda, así que de eso no te puedo contar.";
  return [
    {
      id: "agenda_day",
      keys: [v.turno, "agenda", "cita", "sesion", "que tengo", "reservas", "clientes de hoy"].map(norm),
      allowed: agendaOk, denied: noAgenda,
      async run(c, t) {
        const off = dayOffset(t);
        const r = await loadAgenda(off);
        const list = r.appointments.filter((a) => a.status !== "CANCELADO").sort((a, b) => a.start_at.localeCompare(b.start_at));
        const mine = c.user.role === "PROFESIONAL" ? "tuyos " : "";
        if (!list.length) return { from: "bot", text: `No hay ${v.turnos} ${mine}para ${dayWord(off)}.`, actions: [go("/app/agenda")], quick: off === 0 ? [`${cap(v.turnos)} de mañana`] : undefined };
        return {
          from: "bot",
          text: `${cap(dayWord(off))} hay ${list.length} ${plural(list.length, v.turno, v.turnos)} ${mine}(${longDate(addDays(new Date(), off)).toLowerCase()}):\n` +
            list.slice(0, 8).map((a) => apptLine(r, a)).join("\n") + (list.length > 8 ? `\n… y ${list.length - 8} más.` : ""),
          actions: [go("/app/agenda")],
        };
      },
    },
    {
      id: "next",
      keys: ["sigue", "siguiente", "proximo", "quien viene", "que viene", "despues"].map(norm),
      allowed: agendaOk, denied: noAgenda,
      async run() {
        const r = await loadAgenda(0);
        const now = new Date();
        const live = r.appointments.filter((a) => a.status === "EN_CURSO" || a.status === "EN_SALA");
        const next = r.appointments.filter((a) => (a.status === "CONFIRMADO" || a.status === "PENDIENTE_SENIA") && new Date(a.end_at) > now)
          .sort((a, b) => a.start_at.localeCompare(b.start_at));
        if (!live.length && !next.length) return { from: "bot", text: `No quedan ${v.turnos} para hoy.`, actions: [go("/app/agenda")], quick: [`${cap(v.turnos)} de mañana`] };
        const parts: string[] = [];
        if (live.length) parts.push("Ahora:\n" + live.map((a) => apptLine(r, a)).join("\n"));
        if (next.length) parts.push("Sigue:\n" + next.slice(0, 4).map((a) => apptLine(r, a)).join("\n"));
        return { from: "bot", text: parts.join("\n\n"), actions: [go("/app/agenda")] };
      },
    },
    {
      id: "who_works",
      keys: ["atiende", "atienden", "trabaja", "trabajan", "quien esta", "quienes estan", norm(v.profesional), "equipo", "de turno hoy"],
      allowed: agendaOk, denied: noAgenda,
      async run(_c, t) {
        const off = dayOffset(t);
        const day = addDays(new Date(), off);
        const r = await loadAgenda(off);
        const key = dayKey(day);
        const wd = String((day.getDay() + 6) % 7);   // el backend cuenta desde el lunes (0)
        const closed = r.closed.find((x) => x.date === key && !x.professional_id);
        if (closed) return { from: "bot", text: `${cap(dayWord(off))} el local figura cerrado${closed.reason ? ` (${closed.reason})` : ""}.`, actions: [go("/app/servicios?tab=feriados", "Ver días cerrados")] };
        const lo = new Date(`${key}T00:00:00`).getTime(), hi = lo + 86400000;
        const away = new Set(r.time_off.filter((x) => new Date(x.from_at).getTime() <= lo && new Date(x.to_at).getTime() >= hi).map((x) => x.professional_id));
        const working = r.professionals.filter((p) => (p.hours[wd] || []).length && !away.has(p.id));
        if (!working.length) return { from: "bot", text: `${cap(dayWord(off))} no hay ${v.profesionales} con horario cargado.`, actions: [go("/app/servicios?tab=equipo", `Ver ${v.profesionales}`)] };
        return {
          from: "bot",
          text: `${cap(dayWord(off))} atienden (${working.length}):\n` + working.map((p) => `• ${p.name}: ${p.hours[wd].map(([a, b]) => `${minLabel(a)} a ${minLabel(b)}`).join(" y ")}`).join("\n") +
            (away.size ? `\n\nDe licencia o ausentes: ${r.professionals.filter((p) => away.has(p.id)).map((p) => p.name).join(", ")}.` : ""),
          actions: [go("/app/servicios?tab=equipo", `Ver ${v.profesionales}`)],
        };
      },
    },
    {
      id: "free_slots",
      keys: ["hueco", "libre", "disponible", "disponibilidad", "lugar", "espacio", "cuando hay", "tenes lugar", "tienen lugar"],
      allowed: agendaOk, denied: noAgenda,
      async run(_c, t, tokens) {
        const [services, pros] = await Promise.all([appApi<Svc[]>("/services"), appApi<Pro[]>("/professionals")]);
        if (!services.length) return { from: "bot", text: "Todavía no hay servicios cargados, y sin eso no puedo calcular huecos.", actions: [go("/app/servicios")] };
        let cands = services.filter((s) => t.includes(norm(s.name)));
        if (!cands.length) {
          cands = services.filter((s) => norm(s.name).split(" ").filter((w) => w.length >= 4).some((w) => hit(t, tokens, w) && !["libre", "libres"].includes(w)));
        }
        if (cands.length > 1) cands = cands.filter((s) => t.includes(norm(s.name))).length === 1 ? cands.filter((s) => t.includes(norm(s.name))) : cands;
        if (cands.length !== 1 && services.length === 1) cands = services;
        if (cands.length !== 1) {
          const opts = (cands.length ? cands : services).slice(0, 6);
          return { from: "bot", text: "¿Para qué servicio querés ver los huecos?", quick: opts.map((s) => `Huecos libres de ${s.name}${/\b(manana|hoy)\b/.test(t) ? ` ${dayWord(dayOffset(t))}` : ""}`) };
        }
        const s = cands[0];
        const pro = pros.find((p) => [p.name, p.display_name || ""].some((n) => n && norm(n).split(" ").some((w) => w.length >= 4 && hit(t, tokens, w))));
        const asked = /\b(hoy|manana)\b/.test(t) || t.includes("pasado manana");
        const off = dayOffset(t);
        const from = dayKey(addDays(new Date(), asked ? off : 0));
        const to = dayKey(addDays(new Date(), asked ? off : 6));
        const res = await appApi<Slots>(`/availability?service_ids=${s.id}&date_from=${from}&date_to=${to}${pro ? `&professional_id=${pro.id}` : ""}`);
        const withSlots = res.days.filter((d) => d.slots.length);
        const head = `${s.name} (${s.duration_min} min)${pro ? ` con ${pro.display_name || pro.name}` : ""}`;
        if (!withSlots.length) return { from: "bot", text: `${head}: no hay huecos ${asked ? dayWord(off) : "en los próximos 7 días"}.`, actions: [go("/app/agenda")] };
        const lines = withSlots.slice(0, asked ? 1 : 2).map((d) => {
          const times = d.slots.map((x) => x.time);
          return `• ${dayLabel(new Date(`${d.date}T12:00:00`), true)}: ${times.slice(0, 10).join(", ")}${times.length > 10 ? ` … (+${times.length - 10})` : ""}`;
        });
        return { from: "bot", text: `Huecos libres para ${head}:\n${lines.join("\n")}`, actions: [go("/app/agenda", `Cargar ${v.turno}`)] };
      },
    },
    {
      id: "to_collect",
      keys: ["sin cobrar", "falta cobrar", "faltan cobrar", "por cobrar", "para cobrar", "deben", "debe plata", "pendiente de cobro", "pendientes de cobro"],
      allowed: (c) => c.can("caja"), denied: "Tu usuario o tu plan no incluye la Caja.",
      async run(_c, _t) {
        const list = await appApi<ToCollect[]>("/sales/to-collect");
        if (!list.length) return { from: "bot", text: `No hay ${v.turnos} de hoy pendientes de cobro.` };
        const total = list.reduce((s, x) => s + Math.max(0, x.total - x.deposit_paid), 0);
        return {
          from: "bot",
          text: `Hoy quedan ${list.length} ${plural(list.length, v.turno, v.turnos)} por cobrar (${money(total)} en total):\n` +
            list.slice(0, 6).map((x) => `• ${hhmm(x.start_at)} · ${x.customer_name} — ${money(x.total)}${x.deposit_paid ? ` (seña ${money(x.deposit_paid)})` : ""}`).join("\n") + (list.length > 6 ? `\n… y ${list.length - 6} más.` : ""),
          actions: [go("/app/caja")],
        };
      },
    },
    {
      id: "cash_day",
      keys: ["cobre", "cobraste", "cobramos", "cobros", "caja", "factur", "ingres", "recaud", "vendi", "ventas", "plata", "cuanto hice", "cuanto entro", "propina"],
      allowed: (c) => c.can("caja") && c.front, denied: "El resumen de la caja lo ven el dueño, el encargado y recepción (y solo si tu plan incluye Caja).",
      async run(_c, t) {
        const yesterday = /\bayer\b/.test(t);
        const day = dayKey(addDays(new Date(), yesterday ? -1 : 0));
        const d = await appApi<CashDay>(`/cash-shifts/day?date=${day}`);
        const when = yesterday ? "Ayer" : "Hoy";
        if (!d.sales_count) return { from: "bot", text: `${when} no hay cobros registrados todavía.`, actions: [go("/app/caja")] };
        const methods = Object.entries(d.by_method).filter(([, n]) => n).map(([k, n]) => `• ${PAYMENT_METHODS[k] || k}: ${money(n)}`);
        return {
          from: "bot",
          text: `${when} se cobraron ${money(d.sales_total)} en ${d.sales_count} ${plural(d.sales_count, "venta", "ventas")}.` +
            (methods.length ? "\n" + methods.join("\n") : "") + (d.tips_total ? `\nPropinas aparte: ${money(d.tips_total)}.` : "") + (d.voided_count ? `\nVentas anuladas: ${d.voided_count}.` : ""),
          actions: [go("/app/caja")],
        };
      },
    },
    {
      id: "pending",
      keys: ["pendiente", "que tengo que hacer", "por hacer", "tareas", "alertas", "avisos", "que falta", "que hay que hacer", "urgente"],
      allowed: () => true, denied: "",
      async run() {
        const items = (await appApi<{ items: PendingItem[] }>("/dashboard/pending")).items.filter((i) => !HIDDEN_PENDING.includes(i.key));
        if (!items.length) return { from: "bot", text: "Todo al día: no hay pendientes para hoy." };
        const paths = [...new Set(items.map((i) => i.path))].slice(0, 3);
        return { from: "bot", text: "Esto requiere tu atención:\n" + items.slice(0, 8).map((i) => `• ${i.label}: ${i.count}`).join("\n"), actions: paths.map((p) => go(p)) };
      },
    },
    {
      id: "summary",
      keys: ["como va", "como viene", "como estamos", "resumen", "el dia", "novedades", "que onda"],
      allowed: () => true, denied: "",
      async run(c) {
        const [s, p] = await Promise.all([
          appApi<DaySummary>("/dashboard/summary"),
          appApi<{ items: PendingItem[] }>("/dashboard/pending").catch(() => ({ items: [] as PendingItem[] })),
        ]);
        const lines: string[] = [];
        if (s.appointments_today !== undefined) lines.push(`• ${cap(v.turnos)} de hoy: ${s.appointments_today}`);
        if (s.sales_today !== undefined && c.front) lines.push(`• Cobrado hoy: ${money(s.sales_today)}`);
        if (s.birthdays_today) lines.push(`• Cumpleaños hoy: ${s.birthdays_today}`);
        const pend = p.items.filter((i) => !HIDDEN_PENDING.includes(i.key));
        if (pend.length) lines.push(`• Pendientes: ${pend.length} ${plural(pend.length, "tema", "temas")} para revisar`);
        return { from: "bot", text: lines.length ? "Así viene el día:\n" + lines.join("\n") : "Todavía no hay movimiento hoy.", actions: [go("/app", "Ir a Inicio")], quick: pend.length ? ["Pendientes de hoy"] : undefined };
      },
    },
    {
      id: "birthdays",
      keys: ["cumple", "cumpleanos"],
      allowed: () => true, denied: "",
      async run(c) {
        const list = await appApi<Cust[]>("/customers?filter=cumple&limit=300");
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const rows = list.filter((x) => x.birthday).map((x) => {
          const [, m, d] = x.birthday!.split("-").map(Number);
          let n = new Date(today.getFullYear(), m - 1, d);
          if (n < today) n = new Date(today.getFullYear() + 1, m - 1, d);
          return { name: x.name, days: Math.round((n.getTime() - today.getTime()) / 86400000), when: n };
        }).sort((a, b) => a.days - b.days);
        if (!rows.length) return { from: "bot", text: "No hay cumpleaños en los próximos 7 días." };
        const acts = c.can("fidelizacion") && c.front ? [go("/app/fidelizacion")] : [go("/app/clientes")];
        return {
          from: "bot",
          text: `Cumpleaños de los próximos 7 días (${rows.length}):\n` + rows.slice(0, 8).map((r) => `• ${r.name} — ${r.days === 0 ? "hoy" : r.days === 1 ? "mañana" : shortDate(dayKey(r.when))}`).join("\n"),
          actions: acts,
        };
      },
    },
    {
      id: "inactive",
      keys: ["sin volver", "no vuelven", "no vienen", "inactivo", "hace que no", "dejaron de venir", "reactivar", "perdidos", "no volvieron", "ausentes"],
      allowed: () => true, denied: "",
      async run(c) {
        const list = await appApi<Cust[]>("/customers?filter=inactivos&limit=300");
        if (!list.length) return { from: "bot", text: "No hay clientes que lleven más de 60 días sin venir." };
        const now = Date.now();
        const rows = list.filter((x) => x.last_visit_at).map((x) => ({ name: x.name, days: Math.floor((now - new Date(x.last_visit_at!).getTime()) / 86400000) })).sort((a, b) => b.days - a.days);
        const acts = c.can("fidelizacion") && c.front ? [go("/app/fidelizacion", "Reactivar por WhatsApp"), go("/app/clientes")] : [go("/app/clientes")];
        return {
          from: "bot",
          text: `${list.length >= 300 ? "300 o más" : list.length} ${plural(list.length, "cliente lleva", "clientes llevan")} más de 60 días sin venir. Los que hace más que no vienen:\n` +
            rows.slice(0, 6).map((r) => `• ${r.name} — hace ${r.days} días`).join("\n"),
          actions: acts,
        };
      },
    },
    {
      id: "low_stock",
      keys: ["stock", "poco stock", "se acaba", "se acabo", "reponer", "faltante", "bajo minimo", "productos que faltan"],
      allowed: (c) => c.can("productos") && c.front, denied: "El stock lo ven el dueño, el encargado y recepción (y solo si tu plan incluye Productos).",
      async run() {
        const list = await appApi<Product[]>("/products/low-stock");
        if (!list.length) return { from: "bot", text: "Ningún producto está bajo el mínimo." };
        return {
          from: "bot",
          text: `Hay ${list.length} ${plural(list.length, "producto", "productos")} para reponer:\n` + list.slice(0, 8).map((p) => `• ${p.name}: quedan ${p.stock_qty}${p.unit ? ` ${p.unit}` : ""} (mínimo ${p.min_qty})`).join("\n"),
          actions: [go("/app/productos")],
        };
      },
    },
    {
      id: "expiring",
      keys: ["membresia", "vencen", "por vencer", "vencimiento de pack", "renovar", "renovacion"],
      allowed: (c) => c.can("packs") && c.front, denied: "Los packs y membresías los ven el dueño, el encargado y recepción (y solo si tu plan incluye Packs).",
      async run() {
        const r = await appApi<Expiring>("/memberships/expiring");
        if (!r.memberships.length && !r.packs.length) return { from: "bot", text: "No hay packs ni membresías por vencer en los próximos 7 días." };
        const dl = (n: number | null) => (n === null ? "" : n < 0 ? ` (vencido hace ${-n} d)` : n === 0 ? " (vence hoy)" : ` (vence en ${n} d)`);
        const lines = [
          ...r.memberships.slice(0, 5).map((m) => `• Membresía ${m.plan_name || ""} · ${m.customer_name || "—"}${dl(m.days_left)}`),
          ...r.packs.slice(0, 5).map((p) => `• Pack ${p.name} · ${p.customer_name || "—"}, quedan ${p.sessions_left}${dl(p.days_left)}`),
        ];
        return { from: "bot", text: `Por vencer o renovar (${r.memberships.length + r.packs.length}):\n${lines.join("\n")}`, actions: [go("/app/packs")] };
      },
    },
    {
      id: "bio",
      keys: ["bioseguridad", "esteriliz", "autoclave", "limpieza de hoy", "residuos", "habilitacion", "lotes vencidos"],
      allowed: (c) => c.can("bioseguridad"), denied: "Tu usuario o tu plan no incluye Bioseguridad.",
      async run() {
        const b = await appApi<Bio>("/biosafety/summary");
        const lines = b.alerts.map((a) => `• ${a.text}`);
        const undone = b.cleaning.filter((c) => c.times_today === 0);
        if (undone.length) lines.push(`• Limpieza de hoy sin registrar: ${undone.map((c) => c.name).join(", ")}.`);
        return { from: "bot", text: lines.length ? "Bioseguridad, para revisar:\n" + lines.slice(0, 8).join("\n") : "Bioseguridad al día: sin alertas ni listas de limpieza pendientes.", actions: [go("/app/bioseguridad")] };
      },
    },
  ];
}

/** pendientes de salud: el chat no los muestra */
const HIDDEN_PENDING = ["alergias_hoy", "parche_vencido"];

// =====================================================================
// AYUDA «¿cómo hago…?» (rutas y textos que existen en el sistema)
// =====================================================================
interface Help { id: string; keys: string[]; module?: string; roles?: string[]; text: (v: Vocabulary) => string; to?: string; label?: string }
const HELP: Help[] = [
  {
    id: "nuevo_turno", module: "agenda", keys: ["nuevo turno", "cargar turno", "agendar", "reservar", "dar turno", "anotar", "crear turno", "nueva sesion", "cargo un turno", "cargar una sesion", "sobreturno"],
    text: (v) => `En Agenda tocá «Nuevo ${v.turno}» (o un hueco libre de la grilla). Elegís cliente, servicios y ${v.profesional}, y el sistema te ofrece los horarios libres. Un sobreturno (fuera de horario) pide la autorización de un encargado: su PIN.`,
    to: "/app/agenda", label: "Ir a Agenda",
  },
  {
    id: "estados", module: "agenda", keys: ["llego", "llegada", "empezar", "finalizar", "terminar", "no vino", "cancelar", "mover", "reprogramar", "cambiar horario", "arrastrar", "estado del turno"],
    text: (v) => `Tocá el ${v.turno} en la Agenda para abrir el detalle: ahí marcás «Llegó», «Empezar», «Finalizar» o «No vino», y con «Editar o mover» cambiás el horario (también podés arrastrarlo). «Cancelar ${v.turno}» lo libera.`,
    to: "/app/agenda", label: "Ir a Agenda",
  },
  {
    id: "whatsapp", module: "agenda", roles: ["ADMINISTRADOR", "ENCARGADO", "RECEPCION"], keys: ["whatsapp", "recordatorio", "recordar", "confirmar turno", "confirmacion", "mensajes del dia", "mandar mensaje"],
    text: () => "En Agenda, pestaña «Mensajes del día», están los recordatorios y confirmaciones ya armados. Tocás «Abrir WhatsApp» y se abre el mensaje listo: el envío lo hacés vos, el sistema no manda nada solo.",
    to: "/app/agenda", label: "Ir a Agenda",
  },
  {
    id: "espera", module: "agenda", roles: ["ADMINISTRADOR", "ENCARGADO", "RECEPCION"], keys: ["lista de espera", "espera", "anotar en espera", "se libero"],
    text: () => "En Agenda, pestaña «Lista de espera»: «Anotar a alguien» con el servicio y los días y horas que le sirven. Cuando se libera un hueco, desde ahí lo avisás y le das el turno.",
    to: "/app/agenda", label: "Ir a Agenda",
  },
  {
    id: "cobrar", module: "caja", keys: ["cobrar", "cobro", "venta", "caja", "abrir caja", "cerrar caja", "arqueo", "medio de pago", "propina", "efectivo", "transferencia", "ticket", "vender"],
    text: (v) => `En Caja primero «Abrir caja». En «Para cobrar hoy» aparecen los ${v.turnos} del día: un toque y cobrás, con el medio de pago y la propina aparte. Para una venta suelta usá «Nueva venta». Al terminar el día, «Cerrar caja» para el arqueo. Los comprobantes son internos, no son factura.`,
    to: "/app/caja", label: "Ir a Caja",
  },
  {
    id: "sena", module: "configuracion", keys: ["sena", "mercado pago", "mercadopago", "anticipo", "deposito", "cobrar por adelantado", "link de pago"],
    text: () => "La seña y la política de cancelación están en Configuración → «Agenda y seña». Para cobrarla online, cargá tus datos en «Mercado Pago». También se puede pedir una seña distinta por servicio (Servicios y equipo → editar servicio → Seña).",
    to: "/app/configuracion", label: "Ir a Configuración",
  },
  {
    id: "servicios", module: "servicios", keys: ["servicio", "precio", "duracion", "combo", "fase", "tiempo de pose", "nuevo servicio", "categoria", "sugeridos", "lista de precios"],
    text: (v) => `En Servicios y equipo → «Nuevo servicio» cargás nombre, precio, duración y, si hace falta, fases (trabajo y espera), seña y requisitos. «Sugeridos del rubro» te trae servicios típicos ya armados. Cada ${v.profesional} puede tener su propio precio o duración.`,
    to: "/app/servicios", label: "Ir a Servicios",
  },
  {
    id: "equipo", module: "servicios", keys: ["profesional", "estilista", "barbero", "esteticista", "manicura", "tatuador", "masajista", "cosmetologa", "depiladora", "horario del equipo", "horarios", "licencia", "vacaciones", "dia cerrado", "feriado", "cerrar el local"],
    text: (v) => `En Servicios y equipo → pestaña «${cap(v.profesionales)}» cargás a cada ${v.profesional}, su horario semanal y sus licencias. Los feriados o días que el local no abre van en «Días cerrados».`,
    to: "/app/servicios?tab=equipo", label: "Ir al equipo",
  },
  {
    id: "clientes", keys: ["cliente", "nuevo cliente", "agenda de clientes", "telefono", "buscar cliente", "duplicado", "cumpleanos de clientes", "menor de edad", "anonimizar", "borrar cliente"],
    text: () => "En Clientes: «Nuevo cliente» para cargarlo y el buscador para encontrarlo por nombre, teléfono o DNI. El filtro te muestra inactivos, cumpleaños, ausencias, menores y bloqueados. Para sus datos de salud y consentimientos, mirá Fichas.",
    to: "/app/clientes", label: "Ir a Clientes",
  },
  {
    id: "fichas", module: "fichas", keys: ["ficha", "consentimiento", "alergia", "historial", "formula", "test de parche", "parche", "contraindicacion"],
    text: () => "En Fichas buscás al cliente y ves Resumen, Salud, Historial y Consentimientos. Los datos de salud son sensibles: recepción ve solo la alerta, el detalle lo ven los profesionales y el encargado. Por eso el asistente no muestra fichas ni consentimientos: abrilos directo desde la pantalla.",
    to: "/app/fichas", label: "Ir a Fichas",
  },
  {
    id: "fotos", module: "fotos", keys: ["foto", "antes y despues", "portfolio", "galeria", "subir foto", "comparar"],
    text: () => "En Fotos, pestaña «Por cliente», elegís al cliente y usás «Subir o sacar foto». Antes tiene que haber un consentimiento firmado («Firmar consentimiento»); para publicar en el portfolio hace falta uno específico.",
    to: "/app/fotos", label: "Ir a Fotos",
  },
  {
    id: "packs", module: "packs", keys: ["pack", "bono", "membresia", "abono", "sesiones prepagas", "saldo de sesiones"],
    text: () => "En Packs y membresías: «Saldos de packs» muestra las sesiones que le quedan a cada cliente, «Membresías» los abonos mensuales con su renovación, y «Catálogo» es donde armás los packs y planes que vendés.",
    to: "/app/packs", label: "Ir a Packs",
  },
  {
    id: "productos", module: "productos", keys: ["producto", "insumo", "inventario", "conteo", "proveedor", "stock", "minimo de stock", "lote de producto"],
    text: () => "En Productos y stock cargás lo que vendés y los insumos que gastás, con su stock mínimo. Las pestañas «Insumos por servicio», «Conteo de stock» y «Proveedores» te ayudan a descontar solo, controlar el inventario y reponer.",
    to: "/app/productos", label: "Ir a Productos",
  },
  {
    id: "comisiones", module: "comisiones", keys: ["comision", "liquidar", "liquidacion", "adelanto", "porcentaje del profesional"],
    text: (v) => `Las comisiones se generan solas al cobrar una venta con un ${v.profesional} asignado. En Comisiones → «Liquidar» cerrás el período y en «Reglas» definís los porcentajes. Es un cálculo de gestión, no un recibo de sueldo.`,
    to: "/app/comisiones", label: "Ir a Comisiones",
  },
  {
    id: "fidelizacion", module: "fidelizacion", keys: ["fidelizacion", "fidelizar", "puntos", "premio", "premios", "resena", "referido", "saludo de cumple", "reactivacion"],
    text: () => "En Fidelización: «Cumpleaños» y «Hace que no vienen» te dejan el saludo armado para mandar por WhatsApp, «Puntos y premios» define cómo suman los clientes y «Reseñas» junta las opiniones de cada turno.",
    to: "/app/fidelizacion", label: "Ir a Fidelización",
  },
  {
    id: "recursos", module: "recursos", keys: ["recurso", "sillon", "cabina", "camilla", "boxes", "bloquear", "mantenimiento", "plano del dia"],
    text: (v) => `En Recursos, el «Plano del día» muestra qué ${v.puestos} están libres u ocupados. En la pestaña «Recursos» creás uno con «Nuevo recurso», lo bloqueás o registrás su mantenimiento.`,
    to: "/app/recursos", label: "Ir a Recursos",
  },
  {
    id: "bio", module: "bioseguridad", keys: ["bioseguridad", "esterilizacion", "ciclo", "autoclave", "limpieza", "residuos", "libreta", "libro de bioseguridad", "lotes y material"],
    text: () => "En Bioseguridad: «Esterilización» → «Registrar ciclo», «Lotes y material», «Limpieza» con listas diarias, «Residuos», «Vencimientos» de permisos y libretas, y «Libro» para imprimir. El «Resumen» te marca lo que está vencido. Turnia registra lo que el local declara; no certifica esterilización.",
    to: "/app/bioseguridad", label: "Ir a Bioseguridad",
  },
  {
    id: "reportes", module: "reportes", keys: ["reporte", "estadistica", "informe", "ocupacion", "ingresos del mes", "retencion", "ausencias"],
    text: () => "En Reportes tenés Ocupación, Ingresos, Clientes, Ausencias, Productos y Comisiones, siempre comparados con el período anterior.",
    to: "/app/reportes", label: "Ir a Reportes",
  },
  {
    id: "usuarios", module: "usuarios", keys: ["usuario", "empleado", "roles", "permiso", "el pin", "mi pin", "contrasena", "recepcionista", "encargado"],
    text: () => "En Usuarios creás a tu equipo. Roles: dueño o administrador (todo), encargado (todo lo operativo y servicios, autoriza con su PIN), recepción (agenda, clientes y cobros) y profesional (su agenda, sus fichas y sus comisiones).",
    to: "/app/usuarios", label: "Ir a Usuarios",
  },
  {
    id: "webs", module: "configuracion", keys: ["turnos online", "reserva online", "pagina web", "web", "link de reservas", "vitrina", "instagram", "compartir", "qr", "que reserven"],
    text: () => "Tus links para compartir (turnos online y vitrina del local) están en Configuración → «Ayuda» → «Tus páginas públicas». Copiás el link y lo ponés en Instagram, WhatsApp o un QR. Depende de que tu plan incluya esas webs.",
    to: "/app/configuracion", label: "Ir a Configuración",
  },
  {
    id: "baja_servicio", module: "configuracion", keys: ["dar de baja el servicio", "baja del servicio", "darme de baja", "darse de baja", "cancelar el servicio", "cancelar la suscripcion", "dejar de usar", "ya no quiero usar", "dar de baja turnia"],
    text: () => "Para darte de baja: Configuración → «Baja y arrepentimiento» → «Dar de baja el servicio» (también está en el menú). Se confirma en dos pasos y te da al instante una constancia BAJA-SRV con fecha y hora. No se corta de golpe: seguís usando el sistema hasta el final del período que ya pagaste, no se cobra de nuevo y no borramos tus datos. Si cambiás de idea, podés «Retirar la baja» antes de esa fecha.",
    to: "/app/configuracion", label: "Ir a Configuración",
  },
  {
    id: "rubro", module: "configuracion", keys: ["rubro", "vocabulario", "cambiar nombre", "horario del local", "datos del local", "direccion", "logo", "plantillas de mensajes", "baja", "arrepentimiento"],
    text: () => "En Configuración: «Rubro y vocabulario» cambia cómo se llaman las cosas en tu local, «Local y horarios» tiene tus datos y días de atención, «Mensajes» las plantillas de WhatsApp, y «Baja y arrepentimiento» las solicitudes de tus clientes (hay que responderlas dentro de las 24 h).",
    to: "/app/configuracion", label: "Ir a Configuración",
  },
  {
    id: "tema", keys: ["modo oscuro", "modo claro", "oscuro", "recorrido", "tour", "como funcionamos", "campanita", "notificacion", "campana"],
    text: () => "El modo oscuro o claro se cambia abajo del menú de la izquierda. Ahí mismo, «¿Cómo funcionamos?» te repite el recorrido por el sistema. Los avisos nuevos (reservas, stock, vencimientos) llegan a la campanita de arriba a la derecha.",
  },
];

// =====================================================================
// RESPUESTAS
// =====================================================================
function suggestions(c: Ctx): string[] {
  const v = c.v;
  const out: string[] = [];
  if (c.can("agenda")) out.push(`${cap(v.turnos)} de hoy`, "¿Quién sigue?", "Huecos libres");
  if (c.can("caja") && c.front) out.push("¿Cuánto cobré hoy?");
  out.push("Pendientes de hoy");
  if (c.front || c.boss) out.push("Cumpleaños");
  out.push("Clientes que no vuelven");
  if (c.can("agenda")) out.push(`¿Cómo cargo un ${v.turno}?`);
  if (c.can("caja")) out.push("¿Cómo cobro?");
  return out.slice(0, 8);
}

function helpAllowed(h: Help, c: Ctx) {
  if (h.module && !c.can(h.module)) return false;
  if (h.roles && !h.roles.includes(c.user.role) && c.user.role !== "ADMINISTRADOR") return false;
  return true;
}

async function reply(raw: string, c: Ctx): Promise<Msg> {
  const t = norm(raw);
  const tokens = t.split(" ").filter(Boolean);
  const v = c.v;
  const bot = (text: string, extra: Partial<Msg> = {}): Msg => ({ from: "bot", text, ...extra });

  // ---- charla ----
  if (/^(hola|holi|holis|ola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|que tal)\b/.test(t) && tokens.length <= 4) {
    return bot("¡Hola! ¿En qué te ayudo? Podés tocar una de las sugerencias de abajo.");
  }
  if (/\b(gracias|genial|joya|perfecto|buenisimo|excelente|barbaro|de diez)\b/.test(t) && tokens.length <= 5) {
    return bot("¡De nada! Cualquier cosa, acá estoy.");
  }
  if (/^(chau|chao|adios|hasta luego|nos vemos)\b/.test(t)) return bot("¡Chau! Que tengas un lindo día.");
  if (/(que (sabes|podes|haces)|quien sos|que sos|en que me ayudas|para que servis|que puedo preguntar)/.test(t) || t === "ayuda") {
    return bot(
      "Soy el asistente de Turnia. Te cuento con datos de tu local: " +
      [c.can("agenda") ? `${v.turnos} de hoy y mañana, quién sigue, quién atiende, huecos libres` : "", c.can("caja") && c.front ? "cobros del día y lo que falta cobrar" : "",
        "pendientes, cumpleaños, clientes que no vuelven", c.can("productos") && c.front ? "stock bajo" : "", c.can("packs") && c.front ? "packs por vencer" : "", c.can("bioseguridad") ? "bioseguridad" : ""]
        .filter(Boolean).join("; ") + ". Y te explico cómo hacer cosas: cargar un turno, cobrar, la seña, servicios, fichas, fotos, packs…",
      { quick: ["¿Cómo cargo un " + v.turno + "?", "Pendientes de hoy"] });
  }

  const intents = dataIntents(v);
  const ds = intents.map((i) => ({ i, s: score(t, tokens, i.keys) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  const hs = HELP.map((h) => ({ h, s: score(t, tokens, h.keys.map(norm)) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  const how = HOW.some((k) => hit(t, tokens, norm(k)));

  const showHelp = (h: Help): Msg => helpAllowed(h, c)
    ? bot(h.text(v), h.to ? { actions: [{ label: h.label || "Ir", to: h.to }] } : undefined)
    : bot("Esa parte no está disponible con tu plan o con tu rol. Si la necesitás, consultalo con el dueño del local.");

  const bestD = ds[0], bestH = hs[0];
  const preferHelp = bestH && (!bestD || (how ? bestH.s + 6 >= bestD.s : bestH.s > bestD.s + 3));
  if (preferHelp && bestH) return showHelp(bestH.h);
  if (bestD) {
    if (!bestD.i.allowed(c)) return bot(bestD.i.denied);
    return bestD.i.run(c, t, tokens);
  }
  if (bestH) return showHelp(bestH.h);

  // ---- solo «hoy» / «mañana» ----
  if (/\b(hoy|manana)\b/.test(t)) {
    const i = intents.find((x) => x.id === (c.can("agenda") ? "agenda_day" : "summary"))!;
    return i.run(c, t, tokens);
  }

  return bot(
    `No te entendí del todo. Probá con algo como ${[c.can("agenda") ? `«${v.turnos} de mañana»` : "", c.can("agenda") ? "«¿quién sigue?»" : "", c.can("caja") && c.front ? "«¿cuánto cobré hoy?»" : "", "«pendientes»", "«¿cómo cargo un " + v.turno + "?»"]
      .filter(Boolean).join(", ")}.`,
    { quick: suggestions(c).slice(0, 3) });
}

// =====================================================================
// COMPONENTE
// =====================================================================
function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z" />
      <path d="M8.5 11h7M8.5 14.5h4" />
    </svg>
  );
}

function Assistant({ user }: { user: SessionUser | null }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // en el celular el botón se esconde al bajar la pantalla (así no tapa los botones de acción del final) y vuelve al subir
  const [tuck, setTuck] = useState(false);
  useEffect(() => {
    const last = new WeakMap<EventTarget, number>();
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement | Document;
      const y = t instanceof Document ? window.scrollY : (t as HTMLElement).scrollTop;
      const prev = last.get(t);
      if (prev === undefined) { last.set(t, y); return; }
      if (Math.abs(y - prev) > 6) { setTuck(y > prev && y > 60); last.set(t, y); }
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ctx: Ctx | null = user ? {
    user, v: vocab(user), can: (m: string) => canAccess(user, m),
    front: user.role !== "PROFESIONAL", boss: user.role === "ADMINISTRADOR" || user.role === "ENCARGADO",
  } : null;

  useEffect(() => {
    if (open && msgs.length === 0 && ctx) {
      const first = (user?.name || "").split(" ")[0];
      setMsgs([{
        from: "bot",
        text: `¡Hola${first ? ` ${first}` : ""}! Soy el asistente de Turnia. Te cuento cómo viene el día, quién sigue, los huecos libres y los cobros, o te explico cómo hacer algo.`,
      }]);
    }
    if (open) window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, typing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!ctx) return null;

  async function send(text: string) {
    const q = text.trim().slice(0, 300);
    if (!q || typing || !ctx) return;
    setMsgs((m) => [...m.slice(-59), { from: "user", text: q }]);
    setInput("");
    setTyping(true);
    try {
      const [res] = await Promise.all([reply(q, ctx), new Promise((r) => setTimeout(r, 400))]);
      setMsgs((m) => [...m, res]);
    } catch (e) {
      setMsgs((m) => [...m, { from: "bot", text: e instanceof Error ? `Uy, no pude consultar eso: ${e.message}` : "Uy, algo falló. Probá de nuevo." }]);
    } finally {
      setTyping(false);
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    send(input);
  }

  return (
    <>
      {!open && (
        <button type="button" className={`tn-assist-fab ${tuck ? "is-tucked" : ""}`} onClick={() => setOpen(true)} aria-label="Abrir el asistente" data-assistant="fab">
          <span className="tn-assist-fab-icon"><ChatIcon /></span>
          <span className="tn-assist-fab-text">Asistente</span>
        </button>
      )}
      {open && (
        <section className="tn-assist" role="dialog" aria-label="Asistente de Turnia" data-assistant="panel">
          <header className="tn-assist-head">
            <TurniaLogo size={34} />
            <div>
              <strong>Asistente Turnia</strong>
              <small>Agenda, cobros y ayuda al instante</small>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar el asistente">×</button>
          </header>
          <div className="tn-assist-body" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`tn-assist-msg ${m.from}`}>
                <p>{m.text}</p>
                {m.actions && (
                  <div className="tn-assist-actions">
                    {m.actions.map((a) => (
                      <button type="button" key={a.to + a.label} onClick={() => { navigate(a.to); if (window.matchMedia("(max-width: 860px)").matches) setOpen(false); }}>{a.label} ›</button>
                    ))}
                  </div>
                )}
                {m.quick && i === msgs.length - 1 && (
                  <div className="tn-assist-actions">
                    {m.quick.map((q) => <button type="button" key={q} className="is-quick" onClick={() => send(q)} disabled={typing}>{q}</button>)}
                  </div>
                )}
              </div>
            ))}
            {typing && <div className="tn-assist-msg bot"><p className="tn-assist-typing" aria-label="Escribiendo"><span /><span /><span /></p></div>}
            <div ref={endRef} />
          </div>
          <div className="tn-assist-suggest">
            {suggestions(ctx).map((s) => (
              <button type="button" key={s} onClick={() => send(s)} disabled={typing}>{s}</button>
            ))}
          </div>
          <form className="tn-assist-input" onSubmit={submit}>
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escribí tu pregunta…" aria-label="Tu pregunta" maxLength={300}
              autoComplete="off" spellCheck={false} />
            <button type="submit" disabled={!input.trim() || typing} aria-label="Enviar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
          </form>
        </section>
      )}
    </>
  );
}

export default Assistant;
