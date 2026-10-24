// Bioseguridad (G2): resumen, esterilización, lotes, limpieza, residuos y libro imprimible.
import { useEffect, useRef, useState } from "react";
import { appApi, appBlob, appUpload, dateTime, getSessionUser, saveBlob, shortDate } from "../../config";
import { Empty, Field, Loading, Modal, Pill, strOrNull } from "../ui";
import { printBook } from "../../pages/print/g2print";
import type { BookData } from "../../pages/print/g2print";

export interface Notify { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const canManage = () => { const r = getSessionUser()?.role; return r === "ADMINISTRADOR" || r === "ENCARGADO"; };
const METHODS: [string, string][] = [["AUTOCLAVE", "Autoclave"], ["CALOR_SECO", "Calor seco"], ["QUIMICA", "Química"], ["OTRO", "Otro"]];
const IND_LABEL: Record<string, [string, string]> = { CONFORME: ["Conforme", "green"], NO_CONFORME: ["NO CONFORME", "red"], SIN_INDICADOR: ["Sin indicador", "gray"] };
const LOT_KINDS: [string, string][] = [["TINTA", "Tinta"], ["AGUJA", "Agujas"], ["JOYA", "Joyas"], ["DESCARTABLE", "Descartables"], ["PRODUCTO", "Productos"], ["OTRO", "Otro"]];
const LOT_STATUS: Record<string, [string, string]> = { VIGENTE: ["Vigente", "green"], VENCIDO: ["Vencido", "red"], POR_VENCER: ["Por vencer", "orange"], AGOTADO: ["Agotado", "gray"], SIN_FECHA: ["Sin fecha", "gray"] };
const MOMENTS: Record<string, string> = { APERTURA: "Apertura", CIERRE: "Cierre", ENTRE_CLIENTES: "Entre clientes", SEMANAL: "Semanal" };

// ---------- Resumen ----------
interface Summary {
  tattoo_mode: boolean; alert_days: number; cycles: { last_at: string | null; days_since: number | null; count_30d: number; non_conforme_30d: number };
  lots: { total: number; expired: number; expiring: number }; cleaning: { template_id: number; name: string; moment: string; total: number; times_today: number; done: number }[];
  waste: { last_date: string | null; days_since: number | null }; venue_docs: { expired: number; expiring: number };
  equipment: { id: number; name: string }[]; alerts: { tone: "alert" | "warn"; text: string }[]; disclaimer: string;
}
export function useSummary() {
  const [data, setData] = useState<Summary | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => { appApi<Summary>("/biosafety/summary").then(setData).catch(() => setData(null)); }, [n]);
  return [data, () => setN((x) => x + 1)] as const;
}

export function Resumen({ sum, go }: { sum: Summary | null; go: (t: string) => void }) {
  if (!sum) return <Loading />;
  return (
    <div className="tn-stack">
      {sum.alerts.map((a, i) => <div key={i} className={`g2-banner ${a.tone === "alert" ? "" : "is-warn"}`} role={a.tone === "alert" ? "alert" : undefined}><span aria-hidden="true">!</span><div><strong>{a.text}</strong></div></div>)}
      {!sum.alerts.length && <div className="g2-banner is-ok"><span aria-hidden="true">✓</span><div><strong>Todo al día</strong></div></div>}
      <div className="g2-grid g2-grid-wide">
        <div className="tn-card"><small>Último ciclo de esterilización</small><h2 style={{ margin: "4px 0" }}>{sum.cycles.last_at ? dateTime(sum.cycles.last_at) : "Sin registros"}</h2><small>{sum.cycles.count_30d} en 30 días · {sum.cycles.non_conforme_30d} no conformes</small><div style={{ marginTop: 8 }}><button className="secondary-button g2-small-btn" onClick={() => go("ciclos")}>Ver ciclos</button></div></div>
        <div className="tn-card"><small>Lotes de material</small><h2 style={{ margin: "4px 0" }}>{sum.lots.total}</h2><small>{sum.lots.expired} vencidos · {sum.lots.expiring} por vencer</small><div style={{ marginTop: 8 }}><button className="secondary-button g2-small-btn" onClick={() => go("lotes")}>Ver lotes</button></div></div>
        <div className="tn-card"><small>Último retiro de residuos</small><h2 style={{ margin: "4px 0" }}>{sum.waste.last_date ? shortDate(sum.waste.last_date) : "Sin registros"}</h2><small>{sum.waste.days_since !== null ? `Hace ${sum.waste.days_since} días` : "—"}</small></div>
        <div className="tn-card"><small>Documentos del local</small><h2 style={{ margin: "4px 0" }}>{sum.venue_docs.expired + sum.venue_docs.expiring}</h2><small>{sum.venue_docs.expired} vencidos · {sum.venue_docs.expiring} vencen en 30 días</small><div style={{ marginTop: 8 }}><button className="secondary-button g2-small-btn" onClick={() => go("venc")}>Ver vencimientos</button></div></div>
      </div>
      <div className="tn-card"><h2 style={{ marginTop: 0 }}>Limpieza de hoy</h2>
        {!sum.cleaning.length ? <small>No hay listas de limpieza.</small> : <div className="g2-list">{sum.cleaning.map((c) => (
          <div key={c.template_id} className="g2-row"><div className="g2-row-main"><strong>{c.name}</strong><small>{MOMENTS[c.moment] || c.moment} · {c.times_today ? `${c.done} de ${c.total} ítems` : "sin registrar hoy"}</small></div>
            <div className="g2-progress" style={{ width: 120 }} aria-hidden="true"><span style={{ width: `${c.total ? Math.round((c.done / c.total) * 100) : 0}%` }} /></div></div>))}</div>}
        <div style={{ marginTop: 8 }}><button className="secondary-button g2-small-btn" onClick={() => go("limpieza")}>Registrar limpieza</button></div></div>
      <p className="tn-hint">{sum.disclaimer}</p>
    </div>
  );
}

// ---------- Ciclos ----------
interface Cycle { id: number; date_time: string; equipment_name: string | null; method: string; load_description: string | null; indicator_result: string; lot_code: string | null; operator_name: string | null; notes: string | null; has_attachment: boolean; attachment_id: number | null }
export function Ciclos({ sum, notify, onChanged }: { sum: Summary | null; notify: Notify; onChanged: () => void }) {
  const [from, setFrom] = useState(() => day(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(() => day(new Date()));
  const [rows, setRows] = useState<Cycle[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = () => appApi<{ items: Cycle[] }>(`/sterilization-cycles?date_from=${from}&date_to=${to}`).then((r) => setRows(r.items)).catch(notify.fail);
  useEffect(() => { load(); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const attach = useRef<HTMLInputElement | null>(null);
  const [forId, setForId] = useState<number | null>(null);
  async function upload(f: File | undefined) {
    if (!f || forId === null) return;
    const form = new FormData(); form.append("file", f);
    try { await appUpload(`/sterilization-cycles/${forId}/attachment`, form); notify.show("Archivo guardado"); load(); } catch (e) { notify.fail(e); }
    if (attach.current) attach.current.value = "";
  }
  async function view(id: number | null) { if (id) try { saveBlob(await appBlob(`/biosafety/attachments/${id}`), "ticket-ciclo"); } catch (e) { notify.fail(e); } }
  return (
    <div className="tn-card">
      <div className="g2-head"><div><h2>Ciclos de esterilización</h2><small>Cada ciclo genera su código de lote (E-AAAAMMDD-NN), que después se vincula a los trabajos.</small></div><button className="primary-button" onClick={() => setAdding(true)}>Registrar ciclo</button></div>
      <div className="g2-period">
        <div className="form-group"><label htmlFor="cf">Desde</label><input id="cf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="form-group"><label htmlFor="ct">Hasta</label><input id="ct" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <input ref={attach} type="file" accept="image/*,application/pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
      {!rows ? <Loading /> : !rows.length ? <Empty title="Sin ciclos en el período">Registrá cada vez que esterilizás material.</Empty> : (
        <div className="g2-list">{rows.map((c) => { const ind = IND_LABEL[c.indicator_result] || ["—", "gray"]; return (
          <div key={c.id} className="g2-row"><div className="g2-row-main"><strong>{c.lot_code} · {c.equipment_name}</strong><small>{dateTime(c.date_time)} · {METHODS.find((m) => m[0] === c.method)?.[1]} · {c.operator_name || "—"}{c.load_description ? ` · ${c.load_description}` : ""}</small></div>
            <div className="g2-row-actions"><Pill tone={ind[1]}>{ind[0]}</Pill>
              {c.has_attachment ? <button className="secondary-button g2-small-btn" onClick={() => view(c.attachment_id)}>Ver ticket</button> : <button className="secondary-button g2-small-btn" onClick={() => { setForId(c.id); attach.current?.click(); }}>Adjuntar</button>}</div></div>); })}</div>)}
      {adding && <CycleModal sum={sum} notify={notify} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); onChanged(); }} />}
    </div>
  );
}

function CycleModal({ sum, notify, onClose, onDone }: { sum: Summary | null; notify: Notify; onClose: () => void; onDone: () => void }) {
  const [equip, setEquip] = useState<string>("");
  const [name, setName] = useState("Autoclave");
  const [method, setMethod] = useState("AUTOCLAVE");
  const [load, setLoad] = useState("");
  const [ind, setInd] = useState("CONFORME");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try {
      const c = await appApi<Cycle>("/sterilization-cycles", { method: "POST", body: { equipment_resource_id: equip ? Number(equip) : null, equipment_name: name, method, load_description: strOrNull(load), indicator_result: ind, notes: strOrNull(notes) } });
      notify.show(`Ciclo ${c.lot_code} registrado`); onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="ESTERILIZACIÓN" title="Registrar ciclo" onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save} disabled={busy || !name.trim()}>{busy ? "Guardando..." : "Guardar"}</button></>}>
      <div className="tn-stack">
        {error && <div className="tn-note tn-note-error" role="alert">{error}</div>}
        {sum && sum.equipment.length > 0 && <Field label="Equipo cargado en Recursos"><select value={equip} onChange={(e) => { setEquip(e.target.value); const q = sum.equipment.find((x) => String(x.id) === e.target.value); if (q) setName(q.name); }}><option value="">Otro</option>{sum.equipment.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</select></Field>}
        <Field label="Equipo"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Método"><select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Qué se esterilizó"><input value={load} onChange={(e) => setLoad(e.target.value)} placeholder="Ej.: pinzas, tubos, grips" /></Field>
        <Field label="Resultado del indicador" hint="Un ciclo no conforme deja ese material como no apto."><select value={ind} onChange={(e) => setInd(e.target.value)}><option value="CONFORME">Conforme</option><option value="NO_CONFORME">No conforme</option><option value="SIN_INDICADOR">Sin indicador</option></select></Field>
        <Field label="Notas"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ---------- Lotes ----------
interface Lot { id: number; kind: string; name: string; brand: string | null; lot_code: string | null; expires_on: string | null; qty_in: number; qty_left: number; sterile: boolean; notes: string | null; status: string; days_left: number | null }
export function Lotes({ notify, onChanged }: { notify: Notify; onChanged: () => void }) {
  const manage = canManage();
  const [rows, setRows] = useState<Lot[] | null>(null);
  const [kind, setKind] = useState("");
  const [edit, setEdit] = useState<Lot | "new" | null>(null);
  const [trace, setTrace] = useState<Lot | null>(null);
  const load = () => appApi<Lot[]>(`/material-lots?kind=${kind}`).then(setRows).catch(notify.fail);
  useEffect(() => { load(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="tn-card">
      <div className="g2-head"><div><h2>Lotes y material</h2><small>Tintas, agujas, joyas y descartables con su lote y vencimiento. Permiten saber a qué clientes se les usó un lote.</small></div>{manage && <button className="primary-button" onClick={() => setEdit("new")}>Cargar lote</button>}</div>
      <div className="tn-chips" style={{ marginBottom: 12 }}>{[["", "Todos"], ...LOT_KINDS].map(([k, l]) => <button key={k} className={`tn-chip ${kind === k ? "is-on" : ""}`} onClick={() => setKind(k)}>{l}</button>)}</div>
      {!rows ? <Loading /> : !rows.length ? <Empty title="Sin lotes">{manage ? "Cargá los lotes cuando recibís material." : "Pedile al encargado que cargue los lotes."}</Empty> : (
        <div className="g2-list">{rows.map((l) => { const st = LOT_STATUS[l.status] || ["—", "gray"]; return (
          <div key={l.id} className="g2-row"><div className="g2-row-main"><strong>{l.name}{l.brand ? ` · ${l.brand}` : ""}</strong><small>Lote {l.lot_code || "—"} · {l.expires_on ? `vence ${shortDate(l.expires_on)}` : "sin vencimiento"} · quedan {l.qty_left} de {l.qty_in}{l.sterile ? " · estéril de fábrica" : ""}</small></div>
            <div className="g2-row-actions"><Pill tone={st[1]}>{st[0]}</Pill>{manage && <><button className="secondary-button g2-small-btn" onClick={() => setTrace(l)}>Trazabilidad</button><button className="secondary-button g2-small-btn" onClick={() => setEdit(l)}>Editar</button></>}</div></div>); })}</div>)}
      {edit && <LotModal lot={edit === "new" ? null : edit} notify={notify} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); onChanged(); }} />}
      {trace && <TraceModal lot={trace} onClose={() => setTrace(null)} notify={notify} />}
    </div>
  );
}

function LotModal({ lot, notify, onClose, onDone }: { lot: Lot | null; notify: Notify; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ kind: lot?.kind || "TINTA", name: lot?.name || "", brand: lot?.brand || "", lot_code: lot?.lot_code || "", expires_on: lot?.expires_on || "", qty_in: String(lot?.qty_in ?? ""), qty_left: lot ? String(lot.qty_left) : "", sterile: lot?.sterile ?? false, notes: lot?.notes || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string | boolean) => setF((a) => ({ ...a, [k]: v }));
  async function save() {
    setBusy(true); setError("");
    const body = { kind: f.kind, name: f.name, brand: strOrNull(f.brand), lot_code: strOrNull(f.lot_code), expires_on: strOrNull(f.expires_on), qty_in: Number(f.qty_in) || 0, qty_left: f.qty_left === "" ? null : Number(f.qty_left), sterile: f.sterile, notes: strOrNull(f.notes) };
    try { await appApi(lot ? `/material-lots/${lot.id}` : "/material-lots", { method: lot ? "PUT" : "POST", body }); notify.show("Lote guardado"); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="LOTE" title={lot ? lot.name : "Cargar lote"} size="wide" onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save} disabled={busy || f.name.trim().length < 2}>{busy ? "Guardando..." : "Guardar"}</button></>}>
      <div className="tn-stack">
        {error && <div className="tn-note tn-note-error" role="alert">{error}</div>}
        <div className="g2-form-grid">
          <Field label="Tipo"><select value={f.kind} onChange={(e) => set("kind", e.target.value)}>{LOT_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Nombre"><input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Marca"><input value={f.brand} onChange={(e) => set("brand", e.target.value)} /></Field>
          <Field label="N.º de lote"><input value={f.lot_code} onChange={(e) => set("lot_code", e.target.value)} /></Field>
          <Field label="Vence"><input type="date" value={f.expires_on} onChange={(e) => set("expires_on", e.target.value)} /></Field>
          <Field label="Cantidad que ingresó"><input type="number" min="0" value={f.qty_in} onChange={(e) => set("qty_in", e.target.value)} /></Field>
          {lot && <Field label="Cantidad que queda"><input type="number" min="0" value={f.qty_left} onChange={(e) => set("qty_left", e.target.value)} /></Field>}
        </div>
        <label className="g2-check"><input type="checkbox" checked={f.sterile} onChange={(e) => set("sterile", e.target.checked)} /><span>Descartable estéril de fábrica (no necesita ciclo de esterilización)</span></label>
        <Field label="Notas"><input value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function TraceModal({ lot, onClose, notify }: { lot: Lot; onClose: () => void; notify: Notify }) {
  const [uses, setUses] = useState<{ record_id: number; date: string; customer_name: string | null; template: string | null; qty: number }[] | null>(null);
  useEffect(() => { appApi<{ uses: NonNullable<typeof uses> }>(`/material-lots/${lot.id}/trace`).then((r) => setUses(r.uses)).catch(notify.fail); }, [lot.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal eyebrow="TRAZABILIDAD" title={`${lot.name} · lote ${lot.lot_code || "—"}`} onClose={onClose}>
      {!uses ? <Loading /> : !uses.length ? <Empty title="Todavía no se usó en ningún trabajo">Cuando un registro de trabajo use este lote, aparece acá.</Empty> : (
        <div className="g2-list">{uses.map((u) => <div key={u.record_id} className="g2-row"><div className="g2-row-main"><strong>{u.customer_name || "Cliente"}</strong><small>{shortDate(u.date)} · {u.template || "Trabajo"} · {u.qty} u.</small></div></div>)}</div>)}
    </Modal>
  );
}

// ---------- Limpieza ----------
interface CTpl { id: number; name: string; moment: string; items: string[] }
interface CLog { id: number; template_id: number; template_name: string; moment: string | null; date: string; checked: string[]; total: number; done: number; done_by_name: string | null; notes: string | null }
export function Limpieza({ notify, onChanged }: { notify: Notify; onChanged: () => void }) {
  const manage = canManage();
  const [tpls, setTpls] = useState<CTpl[] | null>(null);
  const [logs, setLogs] = useState<CLog[] | null>(null);
  const [doing, setDoing] = useState<CTpl | null>(null);
  const [edit, setEdit] = useState<CTpl | "new" | null>(null);
  const load = () => { appApi<CTpl[]>("/cleaning-templates").then(setTpls).catch(notify.fail); appApi<CLog[]>("/cleaning-logs").then(setLogs).catch(notify.fail); };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tpls || !logs) return <Loading />;
  return (
    <div className="tn-stack">
      <div className="tn-card">
        <div className="g2-head"><div><h2>Listas de limpieza</h2><small>Tocá una lista para tildar lo que hiciste.</small></div>{manage && <button className="secondary-button" onClick={() => setEdit("new")}>Nueva lista</button>}</div>
        <div className="g2-list">{tpls.map((t) => (
          <div key={t.id} className="g2-row"><div className="g2-row-main"><strong>{t.name}</strong><small>{MOMENTS[t.moment] || t.moment} · {t.items.length} ítems</small></div>
            <div className="g2-row-actions">{manage && <button className="secondary-button g2-small-btn" onClick={() => setEdit(t)}>Editar</button>}<button className="primary-button g2-small-btn" onClick={() => setDoing(t)}>Registrar</button></div></div>))}</div>
      </div>
      <div className="tn-card"><h2 style={{ marginTop: 0 }}>Últimos 7 días</h2>
        {!logs.length ? <small>Todavía no hay registros.</small> : <div className="g2-list">{logs.map((l) => <div key={l.id} className="g2-row"><div className="g2-row-main"><strong>{l.template_name}</strong><small>{shortDate(l.date)} · {l.done} de {l.total} ítems · {l.done_by_name || "—"}</small></div></div>)}</div>}</div>
      {doing && <CleanDoModal tpl={doing} notify={notify} onClose={() => setDoing(null)} onDone={() => { setDoing(null); load(); onChanged(); }} />}
      {edit && <CleanTplModal tpl={edit === "new" ? null : edit} notify={notify} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function CleanDoModal({ tpl, notify, onClose, onDone }: { tpl: CTpl; notify: Notify; onClose: () => void; onDone: () => void }) {
  const [checked, setChecked] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await appApi("/cleaning-logs", { method: "POST", body: { template_id: tpl.id, checked, notes: strOrNull(notes) } }); notify.show("Limpieza registrada"); onDone(); } catch (e) { notify.fail(e); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="LIMPIEZA" title={tpl.name} onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save} disabled={busy}>{busy ? "Guardando..." : "Guardar"}</button></>}>
      <div className="tn-stack">
        <div className="g2-checklist">{tpl.items.map((it) => (
          <label key={it} className="g2-check"><input type="checkbox" checked={checked.includes(it)} onChange={(e) => setChecked((a) => (e.target.checked ? [...a, it] : a.filter((x) => x !== it)))} /><span>{it}</span></label>))}</div>
        <button type="button" className="tn-link" onClick={() => setChecked(checked.length === tpl.items.length ? [] : [...tpl.items])}>{checked.length === tpl.items.length ? "Destildar todo" : "Tildar todo"}</button>
        <Field label="Notas"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function CleanTplModal({ tpl, notify, onClose, onDone }: { tpl: CTpl | null; notify: Notify; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(tpl?.name || "");
  const [moment, setMoment] = useState(tpl?.moment || "APERTURA");
  const [items, setItems] = useState((tpl?.items || []).join("\n"));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await appApi(tpl ? `/cleaning-templates/${tpl.id}` : "/cleaning-templates", { method: tpl ? "PUT" : "POST", body: { name, moment, items: items.split("\n").map((s) => s.trim()).filter(Boolean) } }); notify.show("Lista guardada"); onDone(); }
    catch (e) { notify.fail(e); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="LIMPIEZA" title={tpl ? tpl.name : "Nueva lista"} onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save} disabled={busy || name.trim().length < 2 || !items.trim()}>{busy ? "Guardando..." : "Guardar"}</button></>}>
      <div className="tn-stack">
        <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Momento"><select value={moment} onChange={(e) => setMoment(e.target.value)}>{Object.entries(MOMENTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Ítems" hint="Uno por línea"><textarea rows={8} value={items} onChange={(e) => setItems(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ---------- Residuos ----------
interface Waste { id: number; date: string; operator_name: string | null; manifest_number: string | null; weight_text: string | null; notes: string | null; has_attachment: boolean; attachment_id: number | null }
export function Residuos({ notify, onChanged }: { notify: Notify; onChanged: () => void }) {
  const [rows, setRows] = useState<Waste[] | null>(null);
  const [edit, setEdit] = useState<Waste | "new" | null>(null);
  const attach = useRef<HTMLInputElement | null>(null);
  const [forId, setForId] = useState<number | null>(null);
  const load = () => appApi<Waste[]>("/waste-pickups").then(setRows).catch(notify.fail);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function upload(f: File | undefined) {
    if (!f || forId === null) return;
    const form = new FormData(); form.append("file", f);
    try { await appUpload(`/waste-pickups/${forId}/attachment`, form); notify.show("Constancia guardada"); load(); } catch (e) { notify.fail(e); }
    if (attach.current) attach.current.value = "";
  }
  async function view(id: number | null) { if (id) try { saveBlob(await appBlob(`/biosafety/attachments/${id}`), "constancia-residuos"); } catch (e) { notify.fail(e); } }
  if (!canManage()) return <div className="tn-note tn-note-info">Los retiros de residuos los carga el encargado.</div>;
  return (
    <div className="tn-card">
      <div className="g2-head"><div><h2>Retiro de residuos patogénicos</h2><small>Fecha, operador, número de manifiesto y la constancia escaneada.</small></div><button className="primary-button" onClick={() => setEdit("new")}>Registrar retiro</button></div>
      <input ref={attach} type="file" accept="image/*,application/pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
      {!rows ? <Loading /> : !rows.length ? <Empty title="Sin retiros registrados">Registrá cada retiro con su manifiesto.</Empty> : (
        <div className="g2-list">{rows.map((w) => (
          <div key={w.id} className="g2-row"><div className="g2-row-main"><strong>{shortDate(w.date)} · {w.operator_name || "Operador sin cargar"}</strong><small>Manifiesto {w.manifest_number || "—"}{w.weight_text ? ` · ${w.weight_text}` : ""}</small></div>
            <div className="g2-row-actions">{w.has_attachment ? <button className="secondary-button g2-small-btn" onClick={() => view(w.attachment_id)}>Ver constancia</button> : <button className="secondary-button g2-small-btn" onClick={() => { setForId(w.id); attach.current?.click(); }}>Adjuntar</button>}
              <button className="secondary-button g2-small-btn" onClick={() => setEdit(w)}>Editar</button></div></div>))}</div>)}
      {edit && <WasteModal w={edit === "new" ? null : edit} notify={notify} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); onChanged(); }} />}
    </div>
  );
}

function WasteModal({ w, notify, onClose, onDone }: { w: Waste | null; notify: Notify; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ date: w?.date?.slice(0, 10) || day(new Date()), operator_name: w?.operator_name || "", manifest_number: w?.manifest_number || "", weight_text: w?.weight_text || "", notes: w?.notes || "" });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((a) => ({ ...a, [k]: v }));
  async function save() {
    setBusy(true);
    try { await appApi(w ? `/waste-pickups/${w.id}` : "/waste-pickups", { method: w ? "PUT" : "POST", body: { date: f.date, operator_name: strOrNull(f.operator_name), manifest_number: strOrNull(f.manifest_number), weight_text: strOrNull(f.weight_text), notes: strOrNull(f.notes) } }); notify.show("Retiro guardado"); onDone(); }
    catch (e) { notify.fail(e); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="RESIDUOS" title={w ? "Editar retiro" : "Registrar retiro"} onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save} disabled={busy}>{busy ? "Guardando..." : "Guardar"}</button></>}>
      <div className="tn-stack">
        <Field label="Fecha"><input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Operador"><input value={f.operator_name} onChange={(e) => set("operator_name", e.target.value)} /></Field>
        <Field label="N.º de manifiesto"><input value={f.manifest_number} onChange={(e) => set("manifest_number", e.target.value)} /></Field>
        <Field label="Peso o cantidad"><input value={f.weight_text} onChange={(e) => set("weight_text", e.target.value)} placeholder="Ej.: 3,5 kg" /></Field>
        <Field label="Notas"><input value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ---------- Libro ----------
export function Libro({ notify }: { notify: Notify }) {
  const [from, setFrom] = useState(() => day(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(() => day(new Date()));
  const [busy, setBusy] = useState(false);
  if (!canManage()) return <div className="tn-note tn-note-info">El libro lo imprime el encargado.</div>;
  async function go() {
    setBusy(true);
    try { printBook(await appApi<BookData>(`/biosafety/print?date_from=${from}&date_to=${to}`)); } catch (e) { notify.fail(e); } finally { setBusy(false); }
  }
  return (
    <div className="tn-card">
      <div className="g2-head"><div><h2>Libro de bioseguridad</h2><small>Ciclos, lotes, limpieza, residuos y documentos del período, en una hoja A4 lista para imprimir o guardar en PDF. Documento no válido como factura.</small></div></div>
      <div className="g2-period">
        <div className="form-group"><label htmlFor="lf">Desde</label><input id="lf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="form-group"><label htmlFor="lt">Hasta</label><input id="lt" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="primary-button" onClick={go} disabled={busy}>{busy ? "Armando..." : "Imprimir libro"}</button>
      </div>
    </div>
  );
}
