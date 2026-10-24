// Mensajes del día: confirmar, recordar, reclamar señas y pedir reseñas. Cada uno abre WhatsApp con el texto armado; nunca se envía solo.
import { useCallback, useEffect, useState } from "react";
import { appApi, hhmm } from "../../config";
import { Empty, Loading, Pill } from "../ui";
import Icon from "../Icons";
import { openWa } from "./types";

interface Msg {
  id: number; kind: string; status: string; text: string; due_at: string | null; sent_at: string | null; wa_url: string | null; has_whatsapp: boolean;
  customer: { id: number; name: string; phone: string | null }; appointment: { id: number; date: string; start_at: string; status: string; confirmed: boolean } | null;
}
const KIND: Record<string, string> = { CONFIRMACION: "Confirmar turno", RECORDATORIO: "Recordatorio", SENIA: "Reclamar seña", RESENA: "Pedir reseña", ESPERA: "Lista de espera" };
interface Flash { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }

export default function MensajesDia({ date, flash, onChanged }: { date: string; flash: Flash; onChanged: () => void }) {
  const [data, setData] = useState<Msg[] | null>(null);
  const load = useCallback(() => appApi<{ items: Msg[] }>(`/messages/queue?date=${date}`).then((r) => setData(r.items)).catch((e) => { flash.fail(e); setData([]); }), [date]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setData(null); load(); }, [load]);

  async function send(m: Msg) {
    openWa(m.wa_url);
    try { await appApi(`/messages/${m.id}/sent`, { method: "POST" }); await load(); onChanged(); } catch (e) { flash.fail(e); }
  }
  async function skip(m: Msg) {
    try { await appApi(`/messages/${m.id}/skip`, { method: "POST" }); await load(); onChanged(); } catch (e) { flash.fail(e); }
  }
  if (!data) return <Loading />;
  if (!data.length) return <Empty title="No hay mensajes para este día">Cuando haya turnos para confirmar, recordar o seguir (señas y reseñas), aparecen acá con el texto listo.</Empty>;
  const pend = data.filter((m) => m.status === "PENDIENTE");
  return (
    <div>
      <p className="tn-hint" style={{ marginTop: 0 }}>Tocá «Abrir WhatsApp» y mandá el mensaje desde tu teléfono. Turnia no envía nada solo. {pend.length ? `${pend.length} para hacer.` : "Todo hecho por hoy."}</p>
      <ul className="g1-list">
        {data.map((m) => (
          <li key={m.id} className={`g1-item ${m.status !== "PENDIENTE" ? "is-done" : ""}`}>
            <div className="g1-item-main">
              <strong>{m.customer.name}</strong>
              <small>{KIND[m.kind] || m.kind}{m.appointment ? ` · turno ${m.appointment.date.slice(8, 10)}/${m.appointment.date.slice(5, 7)} ${hhmm(m.appointment.start_at)}` : ""}</small>
              <small>{m.text}</small>
            </div>
            <div className="g1-item-actions">
              {m.status === "PENDIENTE" ? (<>
                {m.has_whatsapp
                  ? <button className="primary-button g1-small" onClick={() => send(m)}><Icon name="message" size={15} /> Abrir WhatsApp</button>
                  : <Pill tone="orange">Sin WhatsApp cargado</Pill>}
                <button className="secondary-button g1-small" onClick={() => skip(m)}>Omitir</button>
              </>) : <Pill tone={m.status === "ENVIADO" ? "green" : "gray"}>{m.status === "ENVIADO" ? "Enviado" : "Omitido"}</Pill>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
