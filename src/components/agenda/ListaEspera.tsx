// Lista de espera: anotados esperando un hueco. El aviso es manual por WhatsApp; desde acá se les da el turno con un clic.
import { useCallback, useEffect, useState } from "react";
import { appApi, shortDate } from "../../config";
import { ConfirmModal } from "../r1/common";
import { Empty, Field, Loading, Modal, Pill } from "../ui";
import Icon from "../Icons";
import { openWa, waLink } from "./types";
import type { SvcOpt, ProOpt } from "./AppointmentForm";

interface Entry {
  id: number; customer_id: number | null; name: string; phone: string | null; service_id: number | null; service_name: string | null; professional_name: string | null;
  date_from: string | null; date_to: string | null; time_from: string | null; time_to: string | null; status: string; notes: string | null; phone_wa: string | null;
}
interface Match { entry_id?: number; id?: number; name?: string; text?: string; wa_url?: string | null; start_at?: string; time?: string; [k: string]: unknown }
interface Flash { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }

export default function ListaEspera({ flash, onSchedule }: { flash: Flash; onSchedule: (e: { id: number; customer_id: number | null; name: string; phone: string | null; service_id: number | null }) => void }) {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [adding, setAdding] = useState(false);
  const [remove, setRemove] = useState<Entry | null>(null);
  const load = useCallback(() => {
    appApi<Entry[]>("/waitlist").then(setRows).catch((e) => { flash.fail(e); setRows([]); });
    appApi<Match[] | { items: Match[] }>("/waitlist/matches").then((m) => setMatches(Array.isArray(m) ? m : m.items || [])).catch(() => setMatches([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  async function setStatus(e: Entry, status: string) {
    try { await appApi(`/waitlist/${e.id}`, { method: "PUT", body: { status } }); load(); } catch (x) { flash.fail(x); }
  }
  async function notify(e: Entry) {
    const url = waLink(e.phone, `Hola ${e.name.split(" ")[0]}, se liberó un horario para ${e.service_name || "tu turno"}. ¿Lo querés? Avisanos y te lo reservamos.`);
    if (!url) { flash.show("No tiene un WhatsApp válido cargado", true); return; }
    openWa(url);
    await setStatus(e, "AVISADO");
  }
  if (!rows) return <Loading />;
  return (
    <div>
      <div className="g1-bar">
        <p className="tn-hint" style={{ margin: 0 }}>Si se libera un hueco, avisales vos por WhatsApp: Turnia no manda nada solo.</p>
        <button className="primary-button" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Anotar a alguien</button>
      </div>
      {matches.length > 0 && <div className="g1-banner is-ok"><strong>{matches.length} {matches.length === 1 ? "anotado puede" : "anotados pueden"} tomar un hueco libre ahora.</strong></div>}
      {rows.length === 0 ? <Empty title="La lista de espera está vacía">Anotá a quien no encuentra horario; cuando se cancele un turno, te avisamos acá.</Empty> : (
        <ul className="g1-list">
          {rows.map((e) => (
            <li key={e.id} className="g1-item">
              <div className="g1-item-main">
                <strong>{e.name} {e.status === "AVISADO" && <Pill tone="blue">Avisado</Pill>}</strong>
                <small>{e.service_name || "Cualquier servicio"}{e.professional_name ? ` · con ${e.professional_name}` : ""}</small>
                <small>{e.date_from ? `Desde el ${shortDate(e.date_from)}` : ""}{e.date_to ? ` hasta el ${shortDate(e.date_to)}` : ""}{e.time_from ? ` · entre ${e.time_from} y ${e.time_to || "cierre"}` : ""}{e.phone ? ` · ${e.phone}` : ""}</small>
                {e.notes && <small>{e.notes}</small>}
              </div>
              <div className="g1-item-actions">
                <button className="secondary-button g1-small" onClick={() => notify(e)}><Icon name="message" size={15} /> Avisar</button>
                <button className="primary-button g1-small" onClick={() => onSchedule({ id: e.id, customer_id: e.customer_id, name: e.name, phone: e.phone, service_id: e.service_id })}>Dar turno</button>
                <button className="secondary-button g1-small" onClick={() => setRemove(e)} aria-label={`Sacar a ${e.name} de la lista`}><Icon name="trash" size={15} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {adding && <AddModal flash={flash} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
      {remove && <ConfirmModal title="Sacar de la lista" confirmLabel="Sacar" onClose={() => setRemove(null)} onConfirm={async () => { await setStatus(remove, "VENCIDA"); setRemove(null); }}>
        <p>¿Sacás a {remove.name} de la lista de espera?</p></ConfirmModal>}
    </div>
  );
}

function AddModal({ flash, onClose, onSaved }: { flash: Flash; onClose: () => void; onSaved: () => void }) {
  const [svcs, setSvcs] = useState<SvcOpt[]>([]);
  const [pros, setPros] = useState<ProOpt[]>([]);
  const [f, setF] = useState({ name: "", phone: "", service_id: "", professional_id: "", date_from: "", date_to: "", time_from: "", time_to: "", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    appApi<SvcOpt[]>("/services").then((s) => setSvcs(s.filter((x) => x.active))).catch(() => undefined);
    appApi<ProOpt[]>("/professionals").then((p) => setPros(p.filter((x) => x.active))).catch(() => undefined);
  }, []);
  const set = (k: keyof typeof f, v: string) => setF((o) => ({ ...o, [k]: v }));
  async function save() {
    if (f.name.trim().length < 2) return setError("Poné el nombre");
    if (!f.service_id) return setError("Elegí el servicio");
    setBusy(true); setError("");
    try {
      await appApi("/waitlist", { method: "POST", body: {
        name: f.name.trim(), phone: f.phone.trim() || null, service_id: Number(f.service_id), professional_id: f.professional_id ? Number(f.professional_id) : null,
        date_from: f.date_from || null, date_to: f.date_to || null, time_from: f.time_from || null, time_to: f.time_to || null, notes: f.notes.trim() || null } });
      flash.show("Anotado/a en la lista de espera");
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }
  return (
    <Modal title="Anotar en la lista de espera" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save} disabled={busy}>Anotar</button></>}>
      <div className="g1-form">
        {error && <div className="g1-banner is-alert" role="alert">{error}</div>}
        <div className="g1-form-grid">
          <Field label="Nombre"><input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="WhatsApp"><input inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="261 555 1234" /></Field>
          <Field label="Servicio"><select value={f.service_id} onChange={(e) => set("service_id", e.target.value)}><option value="">Elegir...</option>{svcs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Con quién (opcional)"><select value={f.professional_id} onChange={(e) => set("professional_id", e.target.value)}><option value="">Cualquiera</option>{pros.map((p) => <option key={p.id} value={p.id}>{p.display_name || p.name}</option>)}</select></Field>
          <Field label="Desde el día"><input type="date" value={f.date_from} onChange={(e) => set("date_from", e.target.value)} /></Field>
          <Field label="Hasta el día"><input type="date" value={f.date_to} onChange={(e) => set("date_to", e.target.value)} /></Field>
          <Field label="Desde la hora"><input type="time" value={f.time_from} onChange={(e) => set("time_from", e.target.value)} /></Field>
          <Field label="Hasta la hora"><input type="time" value={f.time_to} onChange={(e) => set("time_to", e.target.value)} /></Field>
          <Field label="Nota" wide><input value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}
