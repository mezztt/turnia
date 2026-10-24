// Tipos y ayudas de la agenda (G1). Fechas locales sin zona: "2026-10-14T10:30:00".
import { dayKey, hhmm } from "../../config";

export interface Block { kind: "ACTIVA" | "ESPERA" | "BUFFER"; start_at: string; end_at: string }
export interface ApptItem {
  id: number; service_id: number; name: string; professional_id: number | null; resource_id: number | null; order: number; offset_min: number | null;
  start_at: string; end_at: string; duration: number; price: number; status: string; notes: string | null; color: string | null;
  client_pack_id: number | null; blocks: Block[];
}
export interface Alert { key: string; label: string }
export interface ApptPayment { id: number; method: string; amount: number; status: string; reference: string | null; created_at: string | null; refunded_amount: number }
export interface Appt {
  id: number; date: string; start_at: string; end_at: string; status: string; source: string; notes: string | null; internal_notes: string | null;
  overbooked: boolean; deposit_required: boolean; deposit_amount: number; deposit_status: string; hold_expires_at: string | null;
  confirmed_at: string | null; checkin_at: string | null; started_at: string | null; finished_at: string | null; cancelled_at: string | null;
  cancel_by: string | null; cancel_reason: string | null; late_cancel: boolean; sale_id: number | null; readonly: boolean;
  customer: { id: number; name: string; phone: string | null; phone_wa: string | null; no_show_count: number; require_deposit: boolean; is_minor: boolean; first_time: boolean; credit_balance: number } | null;
  alerts: Alert[]; items: ApptItem[]; total: number; link: string | null; past: boolean; payments?: ApptPayment[];
}
export interface AgendaPro { id: number; name: string; role_label: string | null; color: string | null; hours: Record<string, number[][]> }
export interface AgendaData {
  date: string; view: "day" | "week"; from: string; to: string; professionals: AgendaPro[]; appointments: Appt[];
  time_off: { professional_id: number; from_at: string; to_at: string; kind: string; reason: string | null }[];
  closed: { date: string; professional_id: number | null; reason: string | null }[];
  settings: { slot_minutes: number; tattoo_mode: boolean; no_show_grace_min: number; cancel_free_hours: number };
  can_write: boolean; can_overbook_alone: boolean; now: string;
}

export const STATUS_LABEL: Record<string, string> = {
  PENDIENTE_SENIA: "Falta la seña", CONFIRMADO: "Confirmado", EN_SALA: "Llegó", EN_CURSO: "En curso", FINALIZADO: "Finalizado", CANCELADO: "Cancelado", NO_SHOW: "No vino",
};
export const STATUS_TONE: Record<string, string> = {
  PENDIENTE_SENIA: "orange", CONFIRMADO: "brand", EN_SALA: "blue", EN_CURSO: "green", FINALIZADO: "gray", CANCELADO: "gray", NO_SHOW: "red",
};
export const DEPOSIT_LABEL: Record<string, string> = {
  NINGUNA: "Sin seña", PENDIENTE: "Seña pendiente", PAGADA: "Seña paga", RETENIDA: "Seña retenida", DEVUELTA: "Seña devuelta", A_FAVOR: "Seña a favor del cliente",
};
export const SOURCE_LABEL: Record<string, string> = { WEB: "Web", MANUAL: "Mostrador", WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", LISTA_ESPERA: "Lista de espera" };
export const ALERT_ICON: Record<string, string> = {
  alergia: "alert", sena_pendiente: "coin", cumple: "cake", primera_vez: "sparkles", no_shows: "clock", menor: "user", sobreturno: "repeat",
};

export const minutesOf = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
export const isoDay = (iso: string) => iso.slice(0, 10);
export const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const asDate = (iso: string) => new Date(iso);
export { dayKey, hhmm };

/** Primer nombre y apellido corto para el bloque de la grilla */
export function shortName(name: string): string {
  const p = name.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0];
}

/** wa.me desde un teléfono escrito a mano (mismo criterio que el backend: 549 + área + número, sin 0 ni 15) */
export function waNumber(raw: string | null | undefined): string | null {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("549")) d = d.slice(3); else if (d.startsWith("54")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  if (d.length === 12) {
    for (const a of [2, 3, 4]) if (d.slice(a, a + 2) === "15") { d = d.slice(0, a) + d.slice(a + 2); break; }
  }
  return d.length === 10 ? "549" + d : null;
}
export function waLink(raw: string | null | undefined, text = ""): string | null {
  const n = waNumber(raw);
  return n ? `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;
}

/** Abre WhatsApp en otra pestaña (el mensaje se arma acá y lo envía una persona) */
export function openWa(url: string | null | undefined) {
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}
