// Recursos (G1): sillones, cabinas, camillas y equipos. Plano del día, bloqueos y mantenimiento.
import { useCallback, useEffect, useState } from "react";
import { addDays, appApi, dayKey, getSessionUser, hhmm, longDate, parseDay, shortDate, toLocalISO } from "../../config";
import { ConfirmModal } from "../r1/common";
import { Empty, Field, Loading, Modal, Pill } from "../ui";
import Icon from "../Icons";
import { fmtMin, minutesOf } from "../agenda/types";

interface Flash { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }
export interface Res {
  id: number; name: string; kind: string; color: string | null; active: boolean; capacity: number; license_text: string | null; license_expires_on: string | null;
  maintenance_every_days: number | null; last_maintenance_on: string | null; maintenance_late_days: number; maintenance_due_on: string | null; notes: string | null;
}
interface Seg { kind: string; start_at: string; end_at: string; appointment_id: number; label: string; customer: string | null; status: string }
interface RBlock { id: number; reason: string; from_at: string; to_at: string }
interface Occ extends Res { segments: Seg[]; blocks: RBlock[]; occupied_min: number; occupancy_pct: number }
interface OccData { date: string; day_start_min: number; day_end_min: number; resources: Occ[] }

export const KIND_LABEL: Record<string, string> = { SILLON: "Sillón", CABINA: "Cabina", CAMILLA: "Camilla", BOX: "Box", EQUIPO: "Equipo" };
const REASON_LABEL: Record<string, string> = { MANTENIMIENTO: "Mantenimiento", LIMPIEZA: "Limpieza", AVERIA: "Avería", OTRO: "Otro" };

export function Plano({ flash, canEdit, onBlock }: { flash: Flash; canEdit: boolean; onBlock: (r: Res) => void }) {
  const [day, setDay] = useState(dayKey(new Date()));
  const [data, setData] = useState<OccData | null>(null);
  const load = useCallback(() => appApi<OccData>(`/resources/occupancy?date=${day}`).then(setData).catch((e) => { flash.fail(e); setData({ date: day, day_start_min: 540, day_end_min: 1200, resources: [] }); }), [day]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setData(null); load(); }, [load]);
  if (!data) return <Loading />;
  const s = Math.floor(data.day_start_min / 60) * 60, e = Math.ceil(data.day_end_min / 60) * 60, span = Math.max(60, e - s);
  const pos = (m: number) => `${Math.max(0, Math.min(100, ((m - s) / span) * 100))}%`;
  const wid = (a: number, b: number) => `${Math.max(1, Math.min(100, ((b - a) / span) * 100))}%`;
  const ticks: number[] = []; for (let m = s; m <= e; m += span > 600 ? 120 : 60) ticks.push(m);
  const dayStartDate = parseDay(day);
  const clampMin = (iso: string, edge: "s" | "e") => { const d = new Date(iso); const k = dayKey(d); return k < day ? 0 : k > day ? 1440 : edge === "s" ? minutesOf(iso) : minutesOf(iso); };
  return (
    <div>
      <div className="g1-bar">
        <div className="g1-date">
          <button className="g1-icon-btn" onClick={() => setDay(dayKey(addDays(dayStartDate, -1)))} aria-label="Día anterior"><Icon name="chevronLeft" size={16} /></button>
          <strong>{longDate(dayStartDate)}</strong>
          <button className="g1-icon-btn" onClick={() => setDay(dayKey(addDays(dayStartDate, 1)))} aria-label="Día siguiente"><Icon name="chevronRight" size={16} /></button>
        </div>
        <button className="secondary-button" onClick={() => setDay(dayKey(new Date()))}>Hoy</button>
      </div>
      {data.resources.filter((r) => r.active).length === 0 ? <Empty title="Todavía no cargaste recursos">Cargalos en la solapa «Recursos» para ver cuáles están libres cada día.</Empty> : (
        <>
          <div className="g1-plan-axis" aria-hidden="true">{ticks.map((m) => <span key={m} style={{ left: pos(m) }}>{fmtMin(m)}</span>)}</div>
          <div className="g1-plan">
            {data.resources.filter((r) => r.active).map((r) => (
              <div className="g1-plan-row" key={r.id}>
                <div className="g1-plan-name"><strong>{r.name}</strong><small>{KIND_LABEL[r.kind] || r.kind} · {r.occupancy_pct}% ocupado</small></div>
                <div className="g1-plan-line" role="img" aria-label={`${r.name}: ${r.segments.length} turnos y ${r.blocks.length} bloqueos`}>
                  {r.segments.map((sg, i) => {
                    const a = clampMin(sg.start_at, "s"), b = clampMin(sg.end_at, "e");
                    return <div key={i} className={`g1-plan-seg ${sg.kind === "ESPERA" ? "is-wait" : ""}`} style={{ left: pos(a), width: wid(a, b) }} title={`${hhmm(sg.start_at)}-${hhmm(sg.end_at)} ${sg.label}${sg.customer ? " · " + sg.customer : ""}`}>
                      <b>{sg.customer || ""}</b> {sg.label}</div>;
                  })}
                  {r.blocks.map((b) => {
                    const a = clampMin(b.from_at, "s"), z = clampMin(b.to_at, "e");
                    return <div key={`b${b.id}`} className="g1-plan-seg is-block" style={{ left: pos(a), width: wid(a, z) }} title={`${REASON_LABEL[b.reason] || b.reason} ${hhmm(b.from_at)}-${hhmm(b.to_at)}`}>{REASON_LABEL[b.reason] || b.reason}</div>;
                  })}
                </div>
                {canEdit && <div style={{ gridColumn: "1 / -1" }}><button className="secondary-button g1-small" onClick={() => onBlock(r)}><Icon name="wrench" size={14} /> Bloquear {r.name}</button></div>}
              </div>
            ))}
          </div>
          <p className="tn-hint">Lo rayado es la espera: la persona queda libre pero el recurso sigue ocupado. En rojo, lo bloqueado.</p>
        </>
      )}
    </div>
  );
}

export function ListaRecursos({ flash, canEdit, onBlock, refreshKey }: { flash: Flash; canEdit: boolean; onBlock: (r: Res) => void; refreshKey: number }) {
  const [rows, setRows] = useState<Res[] | null>(null);
  const [edit, setEdit] = useState<Res | "new" | null>(null);
  const [maint, setMaint] = useState<Res | null>(null);
  const load = useCallback(() => appApi<Res[]>("/resources").then(setRows).catch((e) => { flash.fail(e); setRows([]); }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load, refreshKey]);
  if (!rows) return <Loading />;
  return (
    <div>
      {canEdit && <div className="g1-bar"><span /><button className="primary-button" onClick={() => setEdit("new")}><Icon name="plus" size={16} /> Nuevo recurso</button></div>}
      {rows.length === 0 ? <Empty title="No hay recursos">Cargá tus sillones, cabinas, camillas o equipos para que el turno reserve también el lugar.</Empty> : (
        <div className="tn-table-wrap"><table className="g1-table">
          <thead><tr><th>Nombre</th><th>Tipo</th><th>Mantenimiento</th><th>Habilitación</th><th>Estado</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.name}</strong>{r.notes && <small>{r.notes}</small>}</td>
                <td>{KIND_LABEL[r.kind] || r.kind}{r.capacity > 1 ? ` · para ${r.capacity}` : ""}</td>
                <td>{r.maintenance_every_days ? (<>
                  {r.maintenance_late_days > 0 ? <Pill tone="red">Vencido hace {r.maintenance_late_days} d</Pill> : <Pill tone="green">Al día</Pill>}
                  <small>Cada {r.maintenance_every_days} días{r.last_maintenance_on ? ` · último ${shortDate(r.last_maintenance_on)}` : " · sin registro"}</small></>) : <small>Sin plan</small>}</td>
                <td>{r.license_text ? <>{r.license_text}<small>{r.license_expires_on ? `Vence ${shortDate(r.license_expires_on)}` : ""}</small></> : <small>-</small>}</td>
                <td>{r.active ? <Pill tone="green">Activo</Pill> : <Pill tone="gray">Inactivo</Pill>}</td>
                {canEdit && <td className="num">
                  {r.maintenance_every_days ? <button className="secondary-button g1-small" onClick={() => setMaint(r)}>Hice el mantenimiento</button> : null}{" "}
                  <button className="secondary-button g1-small" onClick={() => onBlock(r)}>Bloquear</button>{" "}
                  <button className="secondary-button g1-small" onClick={() => setEdit(r)} aria-label={`Editar ${r.name}`}><Icon name="edit" size={14} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {edit && <ResForm res={edit === "new" ? null : edit} flash={flash} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {maint && <ConfirmModal title="Registrar mantenimiento" confirmLabel="Registrar hoy" onClose={() => setMaint(null)}
        onConfirm={async () => { try { await appApi(`/resources/${maint.id}/maintenance`, { method: "POST", body: {} }); flash.show("Mantenimiento registrado"); setMaint(null); load(); } catch (e) { flash.fail(e); } }}>
        <p>Anotamos que hoy se le hizo el mantenimiento a {maint.name}. El próximo vence en {maint.maintenance_every_days} días.</p></ConfirmModal>}
    </div>
  );
}

function ResForm({ res, flash, onClose, onSaved }: { res: Res | null; flash: Flash; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: res?.name || "", kind: res?.kind || "SILLON", color: res?.color || "#4a1d4e", capacity: String(res?.capacity || 1), active: res?.active ?? true,
    license_text: res?.license_text || "", license_expires_on: res?.license_expires_on || "", every: res?.maintenance_every_days ? String(res.maintenance_every_days) : "",
    last: res?.last_maintenance_on || "", notes: res?.notes || "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));
  async function save() {
    if (f.name.trim().length < 2) return setError("Poné un nombre");
    setBusy(true); setError("");
    const body = { name: f.name.trim(), kind: f.kind, color: f.color, active: f.active, capacity: Math.max(1, Number(f.capacity) || 1), license_text: f.license_text.trim() || null,
      license_expires_on: f.license_expires_on || null, maintenance_every_days: f.every ? Number(f.every) : null, last_maintenance_on: f.last || null, notes: f.notes.trim() || null };
    try { await appApi(res ? `/resources/${res.id}` : "/resources", { method: res ? "PUT" : "POST", body }); flash.show("Recurso guardado"); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }
  return (
    <Modal title={res ? `Editar ${res.name}` : "Nuevo recurso"} onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save} disabled={busy}>Guardar</button></>}>
      <div className="g1-form">
        {error && <div className="g1-banner is-alert" role="alert"><div>{error}</div></div>}
        <div className="g1-form-grid">
          <Field label="Nombre"><input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Sillón 1" /></Field>
          <Field label="Tipo"><select value={f.kind} onChange={(e) => set("kind", e.target.value)}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Color"><input type="color" value={f.color} onChange={(e) => set("color", e.target.value)} aria-label="Color" /></Field>
          <Field label="Cuántas personas a la vez"><input type="number" min={1} max={20} value={f.capacity} onChange={(e) => set("capacity", e.target.value)} /></Field>
          <Field label="Mantenimiento cada (días)" hint="Vacío si no tiene plan"><input type="number" min={1} value={f.every} onChange={(e) => set("every", e.target.value)} /></Field>
          <Field label="Último mantenimiento"><input type="date" value={f.last} onChange={(e) => set("last", e.target.value)} /></Field>
          <Field label="Habilitación (por ejemplo, autoclave)"><input value={f.license_text} onChange={(e) => set("license_text", e.target.value)} /></Field>
          <Field label="Vence"><input type="date" value={f.license_expires_on} onChange={(e) => set("license_expires_on", e.target.value)} /></Field>
          <Field label="Nota" wide><input value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        </div>
        <label className="g1-check"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /><span>Activo</span></label>
      </div>
    </Modal>
  );
}

export function BlockModal({ res, flash, onClose, onSaved }: { res: Res; flash: Flash; onClose: () => void; onSaved: () => void }) {
  const today = dayKey(new Date());
  const [f, setF] = useState({ reason: "MANTENIMIENTO", day: today, from: "09:00", to: "13:00", done: false });
  const [blocks, setBlocks] = useState<RBlock[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const loadBlocks = useCallback(() => appApi<RBlock[]>(`/resources/${res.id}/blocks`).then(setBlocks).catch(() => setBlocks([])), [res.id]);
  useEffect(() => { loadBlocks(); }, [loadBlocks]);
  async function save() {
    const a = new Date(`${f.day}T${f.from}:00`), b = new Date(`${f.day}T${f.to}:00`);
    if (!(b > a)) return setError("La hora final tiene que ser posterior a la inicial");
    setBusy(true); setError("");
    try {
      const r = await appApi<{ detail: string }>(`/resources/${res.id}/blocks`, { method: "POST", body: { from_at: toLocalISO(a), to_at: toLocalISO(b), reason: f.reason, done: f.reason === "MANTENIMIENTO" && f.done } });
      flash.show(r.detail); onSaved(); loadBlocks();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo bloquear"); } finally { setBusy(false); }
  }
  async function del(id: number) {
    try { await appApi(`/resources/${res.id}/blocks/${id}`, { method: "DELETE" }); loadBlocks(); onSaved(); } catch (e) { flash.fail(e); }
  }
  return (
    <Modal title={`Bloquear ${res.name}`} onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cerrar</button><button className="primary-button" onClick={save} disabled={busy}>Bloquear</button></>}>
      <div className="g1-form">
        {error && <div className="g1-banner is-alert" role="alert"><div>{error}</div></div>}
        <div className="g1-form-grid">
          <Field label="Motivo"><select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>{Object.entries(REASON_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Día"><input type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} /></Field>
          <Field label="Desde"><input type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="Hasta"><input type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        </div>
        {f.reason === "MANTENIMIENTO" && <label className="g1-check"><input type="checkbox" checked={f.done} onChange={(e) => setF({ ...f, done: e.target.checked })} /><span>Es un mantenimiento que ya se hizo (actualiza la fecha del último)</span></label>}
        <p className="tn-hint">Si ya hay turnos en ese horario no se mueven solos: te avisamos para que los muevas vos.</p>
        {blocks.length > 0 && (<div className="g1-section"><h3>Bloqueos de {res.name}</h3>
          <ul className="g1-list">{blocks.map((b) => (
            <li className="g1-item" key={b.id}><div className="g1-item-main"><strong>{REASON_LABEL[b.reason] || b.reason}</strong><small>{shortDate(b.from_at)} {hhmm(b.from_at)} a {hhmm(b.to_at)}</small></div>
              <button className="secondary-button g1-small" onClick={() => del(b.id)} aria-label="Borrar bloqueo"><Icon name="trash" size={14} /></button></li>))}</ul></div>)}
      </div>
    </Modal>
  );
}

export function canEditResources(): boolean {
  const r = getSessionUser()?.role;
  return r === "ADMINISTRADOR" || r === "ENCARGADO";
}
