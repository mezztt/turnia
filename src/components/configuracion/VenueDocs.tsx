import { useCallback, useEffect, useState } from "react";
import { appApi, shortDate } from "../../config";
import { Field, Loading, Modal, Pill, strOrNull } from "../ui";
import { ConfirmModal, EmptyAction } from "../r1/common";

interface Doc { id: number; name: string; kind: string; kind_label: string; number: string | null; issued_on: string | null; expires_on: string | null; notes: string | null; status: "VENCIDO" | "POR_VENCER" | "VIGENTE" | "SIN_FECHA"; days_left: number | null }
interface Notify { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }
const KINDS: [string, string][] = [["HABILITACION_MUNICIPAL", "Habilitación municipal"], ["PERMISO_SANITARIO", "Permiso sanitario"], ["LIBRETA", "Libreta sanitaria"], ["MATAFUEGOS", "Matafuegos"], ["SEGURO", "Seguro"], ["CURSO", "Curso o habilitación del profesional"], ["OTRO", "Otro"]];

export default function VenueDocs({ show, fail }: Notify) {
  const [rows, setRows] = useState<Doc[] | null>(null);
  const [edit, setEdit] = useState<Doc | { kind: string } | null>(null);
  const load = useCallback(() => appApi<Doc[]>("/venue-documents").then(setRows).catch(fail), [fail]);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <Loading />;
  const missing = KINDS.filter(([k]) => k !== "OTRO" && !rows.some((r) => r.kind === k));
  return (
    <div className="tn-stack">
      <div className="tn-card">
        <div className="tn-card-head"><div><h2>Vencimientos y documentos del local</h2><p>Anotá cuándo vence cada cosa y te avisamos desde Inicio 30 días antes.</p></div>
          <button className="primary-button" onClick={() => setEdit({ kind: "OTRO" })}>Agregar documento</button></div>
        {!rows.length ? <EmptyAction title="Todavía no cargaste nada" text="Empezá por la habilitación municipal, el permiso sanitario, las libretas del equipo, el matafuegos y el seguro." /> : (
          <div className="tn-table-wrap"><table className="tn-table">
            <thead><tr><th>Documento</th><th>Número</th><th>Vence</th><th>Estado</th></tr></thead>
            <tbody>{rows.map((d) => (
              <tr key={d.id} className="is-click" onClick={() => setEdit(d)}>
                <td><strong>{d.name}</strong><small>{d.kind_label}</small></td><td>{d.number || "—"}</td><td>{d.expires_on ? shortDate(d.expires_on) : "—"}</td>
                <td>{d.status === "VENCIDO" ? <Pill tone="red">Vencido hace {Math.abs(d.days_left ?? 0)} días</Pill> : d.status === "POR_VENCER" ? <Pill tone="orange">Vence en {d.days_left} días</Pill> : d.status === "VIGENTE" ? <Pill tone="green">Vigente</Pill> : <Pill tone="gray">Sin fecha</Pill>}</td>
              </tr>))}</tbody>
          </table></div>)}
        {missing.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <span className="tn-hint" style={{ marginTop: 0 }}>Agregar rápido:</span>
            <div className="tn-chips" style={{ marginTop: 6 }}>{missing.map(([k, l]) => <button key={k} type="button" className="tn-chip" onClick={() => setEdit({ kind: k })}>+ {l}</button>)}</div>
          </div>)}
      </div>
      {edit && <DocModal doc={"id" in edit ? edit : null} kind={edit.kind} onClose={() => setEdit(null)} onDone={load} show={show} fail={fail} />}
    </div>
  );
}

function DocModal({ doc, kind, onClose, onDone, show, fail }: Notify & { doc: Doc | null; kind: string; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [f, setF] = useState({ kind: doc?.kind ?? kind, name: doc?.name ?? (KINDS.find(([k]) => k === kind)?.[1] ?? ""), number: doc?.number ?? "", issued_on: doc?.issued_on ?? "", expires_on: doc?.expires_on ?? "", notes: doc?.notes ?? "" });
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await appApi(doc ? `/venue-documents/${doc.id}` : "/venue-documents", { method: doc ? "PUT" : "POST", body: { kind: f.kind, name: f.name, number: strOrNull(f.number), issued_on: f.issued_on || null, expires_on: f.expires_on || null, notes: strOrNull(f.notes) } });
      show("Documento guardado"); await onDone(); onClose();
    } catch (e) { fail(e); setBusy(false); }
  }
  async function del() {
    setBusy(true);
    try { await appApi(`/venue-documents/${doc!.id}`, { method: "DELETE" }); show("Documento borrado"); await onDone(); onClose(); } catch (e) { fail(e); setBusy(false); setAsk(false); }
  }
  return (
    <Modal eyebrow="DOCUMENTO" title={doc ? doc.name : "Nuevo documento"} size="wide" onClose={onClose}
      footer={<>{doc && <button className="tn-danger-button" style={{ marginRight: "auto" }} onClick={() => setAsk(true)}>Borrar</button>}<button className="secondary-button" onClick={onClose}>Cerrar</button><button className="primary-button" onClick={save} disabled={busy}>{busy ? "Guardando..." : "Guardar"}</button></>}>
      <div className="tn-grid-form">
        <Field label="Tipo"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, name: doc ? f.name : (KINDS.find(([k]) => k === e.target.value)?.[1] ?? f.name) })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Nombre"><input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Número"><input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
        <Field label="Emitido el"><input type="date" value={f.issued_on} onChange={(e) => setF({ ...f, issued_on: e.target.value })} /></Field>
        <Field label="Vence el" hint="Te avisamos 30 días antes."><input type="date" value={f.expires_on} onChange={(e) => setF({ ...f, expires_on: e.target.value })} /></Field>
        <Field label="Notas" wide><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      {ask && <ConfirmModal title="Borrar el documento" confirmLabel="Borrar" danger busy={busy} onClose={() => setAsk(false)} onConfirm={del}>Se pierde el registro y su vencimiento.</ConfirmModal>}
    </Modal>
  );
}
