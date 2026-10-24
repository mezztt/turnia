// Servicios y equipo (G1): catálogo con fases visuales, quién hace qué, profesionales con horarios y ausencias, feriados y sugeridos del rubro.
import { useCallback, useEffect, useMemo, useState } from "react";
import { WEEKDAYS, appApi, getSessionUser, money, shortDate, splitList, toLocalISO, vocab } from "../../config";
import { ConfirmModal } from "../r1/common";
import { Empty, Field, Loading, Modal, Pill } from "../ui";
import Icon from "../Icons";

interface Flash { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }
interface Phase { name: string; kind: "ACTIVA" | "ESPERA"; minutes: number }
interface Assign { professional_id: number; price_override: number | null; duration_override: number | null }
export interface Svc {
  id: number; category_id: number | null; name: string; description: string | null; price: number; price_is_from: boolean; duration_min: number; buffer_after_min: number;
  color: string | null; active: boolean; online_bookable: boolean; sort: number; deposit_mode: string; deposit_value: number; requires_resource_kind: string | null;
  specific_resource_id: number | null; requires_consent_template_id: number | null; requires_patch_test_days: number | null; requires_health_form: boolean;
  sessions_hint: number | null; min_gap_days: number | null; rubro_tag: string | null; phases: (Phase & { id: number })[]; professionals: Assign[];
}
interface Cat { id: number; name: string; sort: number; active: boolean }
export interface Pro {
  id: number; name: string; display_name: string | null; role_label: string | null; color: string | null; photo: string | null; bio: string | null; active: boolean;
  bookable_online: boolean; sort: number; default_commission_pct: number | null; matricula_text: string | null; libreta_expires_on: string | null;
  schedule: { id: number; weekday: number; start_time: string; end_time: string; resource_id: number | null }[] | null;
}
const canEdit = () => ["ADMINISTRADOR", "ENCARGADO"].includes(getSessionUser()?.role || "");
const proName = (p: Pro) => p.display_name || p.name;

// ================= SERVICIOS =================
export function Servicios({ flash }: { flash: Flash }) {
  const v = vocab(getSessionUser());
  const edit = canEdit();
  const [svcs, setSvcs] = useState<Svc[] | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [pros, setPros] = useState<Pro[]>([]);
  const [open, setOpen] = useState<Svc | "new" | null>(null);
  const [catEdit, setCatEdit] = useState<Cat | "new" | null>(null);
  const load = useCallback(() => {
    appApi<Svc[]>("/services?include_inactive=true").then(setSvcs).catch((e) => { flash.fail(e); setSvcs([]); });
    appApi<Cat[]>("/service-categories").then(setCats).catch(() => setCats([]));
    appApi<Pro[]>("/professionals?include_inactive=true").then(setPros).catch(() => setPros([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  if (!svcs) return <Loading />;
  const groups = [...cats.map((c) => ({ id: c.id as number | null, name: c.name, items: svcs.filter((s) => s.category_id === c.id) })), { id: null as number | null, name: "Sin categoría", items: svcs.filter((s) => !s.category_id || !cats.some((c) => c.id === s.category_id)) }].filter((g) => g.items.length || g.id !== null);
  return (
    <div>
      {edit && <div className="g1-bar"><button className="secondary-button" onClick={() => setCatEdit("new")}>Nueva categoría</button><button className="primary-button" onClick={() => setOpen("new")}><Icon name="plus" size={16} /> Nuevo servicio</button></div>}
      {svcs.length === 0 ? <Empty title="Todavía no hay servicios">Cargalos uno por uno{edit ? " o traé los sugeridos de tu rubro en la solapa «Sugeridos»" : ""}.</Empty> : groups.map((g) => (
        <div key={g.id ?? "none"}>
          <div className="g1-group"><h3>{g.name}</h3><Pill tone="gray">{g.items.length}</Pill>
            {edit && g.id !== null && <button className="secondary-button g1-small" onClick={() => setCatEdit(cats.find((c) => c.id === g.id) || null)} aria-label={`Editar categoría ${g.name}`}><Icon name="edit" size={14} /></button>}</div>
          <div className="tn-table-wrap"><table className="g1-table">
            <thead><tr><th>Servicio</th><th>Duración</th><th className="num">Precio</th><th>Seña</th><th>{cap1(v.profesionales)}</th><th>Estado</th></tr></thead>
            <tbody>{g.items.map((s) => (
              <tr key={s.id} className={edit ? "is-click" : ""} onClick={() => edit && setOpen(s)}>
                <td><strong>{s.color && <i className="g1-sw" style={{ background: s.color, display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 6 }} />}{s.name}</strong>
                  {s.phases.some((p) => p.kind === "ESPERA") && <small>Tiene tiempo de espera: {v.profesional} queda libre</small>}</td>
                <td>{s.duration_min} min{s.buffer_after_min ? <small>+ {s.buffer_after_min} de preparación</small> : null}</td>
                <td className="num">{s.price_is_from ? "desde " : ""}{money(s.price)}</td>
                <td>{s.deposit_mode === "NINGUNA" ? "-" : s.deposit_mode === "FIJA" ? money(s.deposit_value) : `${s.deposit_value}%`}</td>
                <td>{s.professionals.length ? s.professionals.length : <Pill tone="orange">Sin asignar</Pill>}</td>
                <td>{s.active ? (s.online_bookable ? <Pill tone="green">Online</Pill> : <Pill tone="blue">Mostrador</Pill>) : <Pill tone="gray">Inactivo</Pill>}</td>
              </tr>))}</tbody></table></div>
        </div>))}
      {open && <ServiceEditor svc={open === "new" ? null : open} cats={cats} pros={pros} flash={flash} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
      {catEdit && <CategoryModal cat={catEdit === "new" ? null : catEdit} flash={flash} onClose={() => setCatEdit(null)} onSaved={() => { setCatEdit(null); load(); }} />}
    </div>
  );
}
const cap1 = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function CategoryModal({ cat, flash, onClose, onSaved }: { cat: Cat | null; flash: Flash; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(cat?.name || "");
  const [active, setActive] = useState(cat?.active ?? true);
  const [error, setError] = useState("");
  async function save() {
    try { await appApi(cat ? `/service-categories/${cat.id}` : "/service-categories", { method: cat ? "PUT" : "POST", body: { name: name.trim(), sort: cat?.sort || 0, active } }); flash.show("Categoría guardada"); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
  }
  return (
    <Modal title={cat ? "Editar categoría" : "Nueva categoría"} onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save}>Guardar</button></>}>
      <div className="g1-form">{error && <div className="g1-banner is-alert" role="alert"><div>{error}</div></div>}
        <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <label className="g1-check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Activa</span></label></div>
    </Modal>
  );
}

function ServiceEditor({ svc, cats, pros, flash, onClose, onSaved }: { svc: Svc | null; cats: Cat[]; pros: Pro[]; flash: Flash; onClose: () => void; onSaved: () => void }) {
  const v = vocab(getSessionUser());
  const mods = splitList(getSessionUser()?.enabled_modules);
  const [f, setF] = useState({
    name: svc?.name || "", category_id: svc?.category_id ? String(svc.category_id) : "", description: svc?.description || "", price: String(svc?.price ?? ""), price_is_from: svc?.price_is_from ?? false,
    duration: String(svc?.duration_min ?? 30), buffer: String(svc?.buffer_after_min ?? 0), color: svc?.color || "#4a1d4e", active: svc?.active ?? true, online: svc?.online_bookable ?? true,
    deposit_mode: svc?.deposit_mode || "NINGUNA", deposit_value: String(svc?.deposit_value ?? ""), patch: svc?.requires_patch_test_days ? String(svc.requires_patch_test_days) : "",
    health: svc?.requires_health_form ?? false, sessions: svc?.sessions_hint ? String(svc.sessions_hint) : "", gap: svc?.min_gap_days ? String(svc.min_gap_days) : "",
    resource_kind: svc?.requires_resource_kind || "" });
  const [phases, setPhases] = useState<Phase[]>(svc?.phases.map(({ name, kind, minutes }) => ({ name, kind, minutes })) || []);
  const [assign, setAssign] = useState<Record<number, { on: boolean; price: string; dur: string }>>(() => {
    const o: Record<number, { on: boolean; price: string; dur: string }> = {};
    for (const p of pros) { const a = svc?.professionals.find((x) => x.professional_id === p.id); o[p.id] = { on: !!a, price: a?.price_override != null ? String(a.price_override) : "", dur: a?.duration_override != null ? String(a.duration_override) : "" }; }
    return o;
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, val: (typeof f)[K]) => setF((o) => ({ ...o, [k]: val }));
  const total = phases.reduce((t, p) => t + (Number(p.minutes) || 0), 0);
  const upd = (i: number, patch: Partial<Phase>) => setPhases((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i: number, d: number) => setPhases((ps) => { const a = [...ps]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });

  async function save() {
    if (f.name.trim().length < 2) return setError("Poné el nombre");
    if (phases.length && !phases.some((p) => p.kind === "ACTIVA")) return setError(`Tiene que haber al menos una fase en la que ${v.profesional} trabaja`);
    if (phases.some((p) => !p.name.trim() || !(Number(p.minutes) > 0))) return setError("Cada fase necesita nombre y minutos");
    setBusy(true); setError("");
    const body = { category_id: f.category_id ? Number(f.category_id) : null, name: f.name.trim(), description: f.description.trim() || null, price: Number(f.price) || 0, price_is_from: f.price_is_from,
      duration_min: phases.length ? total : Math.max(5, Number(f.duration) || 30), buffer_after_min: Number(f.buffer) || 0, color: f.color, active: f.active, online_bookable: f.online,
      deposit_mode: f.deposit_mode, deposit_value: f.deposit_mode === "NINGUNA" ? 0 : Number(f.deposit_value) || 0, requires_resource_kind: f.resource_kind || null,
      requires_patch_test_days: f.patch ? Number(f.patch) : null, requires_health_form: f.health, sessions_hint: f.sessions ? Number(f.sessions) : null, min_gap_days: f.gap ? Number(f.gap) : null,
      specific_resource_id: svc?.specific_resource_id ?? null, requires_consent_template_id: svc?.requires_consent_template_id ?? null, rubro_tag: svc?.rubro_tag ?? null, sort: svc?.sort ?? 0 };
    try {
      const saved = await appApi<Svc>(svc ? `/services/${svc.id}` : "/services", { method: svc ? "PUT" : "POST", body });
      await appApi(`/services/${saved.id}/phases`, { method: "PUT", body: { phases: phases.map((p) => ({ name: p.name.trim(), kind: p.kind, minutes: Number(p.minutes) })) } });
      const list = Object.entries(assign).filter(([, a]) => a.on).map(([id, a]) => ({ professional_id: Number(id), price_override: a.price !== "" ? Number(a.price) : null, duration_override: a.dur !== "" ? Number(a.dur) : null }));
      await appApi(`/services/${saved.id}/professionals`, { method: "PUT", body: { professionals: list } });
      flash.show("Servicio guardado"); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }
  const activePros = pros.filter((p) => p.active);
  return (
    <Modal title={svc ? svc.name : "Nuevo servicio"} onClose={onClose} size="xl" footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save} disabled={busy}>{busy ? "Guardando..." : "Guardar"}</button></>}>
      <div className="g1-form">
        {error && <div className="g1-banner is-alert" role="alert"><div>{error}</div></div>}
        <div className="g1-form-grid">
          <Field label="Nombre"><input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Categoría"><select value={f.category_id} onChange={(e) => set("category_id", e.target.value)}><option value="">Sin categoría</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Precio"><input type="number" min={0} value={f.price} onChange={(e) => set("price", e.target.value)} /></Field>
          <Field label="Color en la agenda"><input type="color" value={f.color} onChange={(e) => set("color", e.target.value)} aria-label="Color" /></Field>
          <Field label="Descripción" wide><input value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
        </div>
        <div className="g1-row">
          <label className="g1-check"><input type="checkbox" checked={f.price_is_from} onChange={(e) => set("price_is_from", e.target.checked)} /><span>El precio es «desde»</span></label>
          <label className="g1-check"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /><span>Activo</span></label>
          {mods.includes("web_turnos") && <label className="g1-check"><input type="checkbox" checked={f.online} onChange={(e) => set("online", e.target.checked)} /><span>Se puede reservar online</span></label>}
        </div>

        <div className="g1-section"><h3>Tiempos</h3>
          <p className="tn-hint" style={{ marginTop: 0 }}>Dividilo en fases si hay una espera (por ejemplo, la pose de un color): en la espera {v.profesional} queda libre para atender a otra persona, pero el lugar sigue ocupado.</p>
          {phases.length === 0 ? (
            <div className="g1-form-grid"><Field label="Duración (minutos)"><input type="number" min={5} value={f.duration} onChange={(e) => set("duration", e.target.value)} /></Field>
              <Field label="Preparación después (min)" hint="Limpieza o armado, no cuenta para el cliente"><input type="number" min={0} value={f.buffer} onChange={(e) => set("buffer", e.target.value)} /></Field></div>
          ) : (<>
            <div className="g1-phasebar" role="img" aria-label="Fases del servicio">{phases.map((p, i) => <span key={i} className={p.kind === "ACTIVA" ? "is-act" : "is-wait"} style={{ flex: Math.max(1, Number(p.minutes) || 1) }}>{p.name}</span>)}</div>
            <p className="tn-hint">Total: {total} minutos</p>
            {phases.map((p, i) => (
              <div className="g1-phase-row" key={i}>
                <input aria-label={`Nombre de la fase ${i + 1}`} value={p.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Aplicación" />
                <select aria-label="Tipo de fase" value={p.kind} onChange={(e) => upd(i, { kind: e.target.value as Phase["kind"] })}><option value="ACTIVA">Trabaja</option><option value="ESPERA">Espera</option></select>
                <input aria-label="Minutos" type="number" min={1} value={p.minutes} onChange={(e) => upd(i, { minutes: Number(e.target.value) })} />
                <span className="g1-bar-group">
                  <button className="g1-icon-btn" onClick={() => move(i, -1)} aria-label="Subir fase" disabled={i === 0}>↑</button>
                  <button className="g1-icon-btn" onClick={() => move(i, 1)} aria-label="Bajar fase" disabled={i === phases.length - 1}>↓</button>
                  <button className="g1-icon-btn" onClick={() => setPhases((ps) => ps.filter((_, j) => j !== i))} aria-label="Quitar fase"><Icon name="trash" size={15} /></button></span>
              </div>))}
          </>)}
          <div className="g1-actions">
            <button className="secondary-button g1-small" onClick={() => setPhases((ps) => (ps.length ? [...ps, { name: "Espera", kind: "ESPERA", minutes: 15 }] : [{ name: "Aplicación", kind: "ACTIVA", minutes: Number(f.duration) || 30 }, { name: "Espera", kind: "ESPERA", minutes: 30 }, { name: "Enjuague", kind: "ACTIVA", minutes: 15 }]))}>
              <Icon name="plus" size={14} /> {phases.length ? "Agregar fase" : "Dividir en fases"}</button>
            {phases.length > 0 && <button className="secondary-button g1-small" onClick={() => { set("duration", String(total)); setPhases([]); }}>Volver a una sola fase</button>}
          </div>
        </div>

        <div className="g1-section"><h3>Seña</h3><div className="g1-form-grid">
          <Field label="Cómo se pide"><select value={f.deposit_mode} onChange={(e) => set("deposit_mode", e.target.value)}><option value="NINGUNA">Sin seña (usa la general del local)</option><option value="FIJA">Monto fijo</option><option value="PORCENTAJE">Porcentaje del precio</option></select></Field>
          {f.deposit_mode !== "NINGUNA" && <Field label={f.deposit_mode === "FIJA" ? "Monto" : "Porcentaje"}><input type="number" min={0} value={f.deposit_value} onChange={(e) => set("deposit_value", e.target.value)} /></Field>}</div></div>

        <div className="g1-section"><h3>Requisitos y repetición</h3><div className="g1-form-grid">
          {mods.includes("recursos") && <Field label="Necesita un lugar de tipo"><select value={f.resource_kind} onChange={(e) => set("resource_kind", e.target.value)}><option value="">Ninguno</option><option value="SILLON">Sillón</option><option value="CABINA">Cabina</option><option value="CAMILLA">Camilla</option><option value="BOX">Box</option><option value="EQUIPO">Equipo</option></select></Field>}
          <Field label="Prueba de alergia con (días de anticipación)"><input type="number" min={1} value={f.patch} onChange={(e) => set("patch", e.target.value)} /></Field>
          <Field label="Sesiones sugeridas"><input type="number" min={1} value={f.sessions} onChange={(e) => set("sessions", e.target.value)} /></Field>
          <Field label="Días mínimos entre sesiones"><input type="number" min={1} value={f.gap} onChange={(e) => set("gap", e.target.value)} /></Field></div>
          <label className="g1-check"><input type="checkbox" checked={f.health} onChange={(e) => set("health", e.target.checked)} /><span>Pide ficha de salud antes de empezar</span></label></div>

        <div className="g1-section"><h3>Quién lo hace</h3>
          {activePros.length === 0 ? <p className="tn-hint">Cargá {v.profesionales} en la solapa «Equipo».</p> : (<>
            <p className="tn-hint" style={{ marginTop: 0 }}>Tildá quiénes hacen este servicio. Si alguno cobra otro precio o tarda distinto, completalo; si no, déjalo vacío.</p>
            {activePros.map((p) => { const a = assign[p.id] || { on: false, price: "", dur: "" }; const setA = (patch: Partial<typeof a>) => setAssign((o) => ({ ...o, [p.id]: { ...a, ...patch } })); return (
              <div className="g1-assign" key={p.id}>
                <input type="checkbox" aria-label={`${proName(p)} hace este servicio`} checked={a.on} onChange={(e) => setA({ on: e.target.checked })} />
                <span>{proName(p)}</span>
                <input type="number" min={0} aria-label={`Precio propio de ${proName(p)}`} placeholder="Precio propio" disabled={!a.on} value={a.price} onChange={(e) => setA({ price: e.target.value })} />
                <input type="number" min={5} aria-label={`Duración propia de ${proName(p)}`} placeholder="Minutos propios" disabled={!a.on || phases.length > 0} value={a.dur} onChange={(e) => setA({ dur: e.target.value })} />
              </div>); })}</>)}
        </div>
      </div>
    </Modal>
  );
}

// ================= EQUIPO =================
export function Equipo({ flash }: { flash: Flash }) {
  const v = vocab(getSessionUser());
  const edit = canEdit();
  const [pros, setPros] = useState<Pro[] | null>(null);
  const [open, setOpen] = useState<Pro | "new" | null>(null);
  const [sched, setSched] = useState<Pro | null>(null);
  const [off, setOff] = useState<Pro | null>(null);
  const load = useCallback(() => appApi<Pro[]>("/professionals?include_inactive=true").then(setPros).catch((e) => { flash.fail(e); setPros([]); }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  if (!pros) return <Loading />;
  return (
    <div>
      {edit && <div className="g1-bar"><span /><button className="primary-button" onClick={() => setOpen("new")}><Icon name="plus" size={16} /> Nuevo {v.profesional}</button></div>}
      {pros.length === 0 ? <Empty title={`Todavía no cargaste ${v.profesionales}`}>Sin {v.profesionales} no se pueden dar {v.turnos}.</Empty> : (
        <div className="tn-table-wrap"><table className="g1-table">
          <thead><tr><th>Nombre</th><th>Horario semanal</th><th>Estado</th>{edit && <th />}</tr></thead>
          <tbody>{pros.map((p) => (
            <tr key={p.id}>
              <td><strong><i style={{ background: p.color || "var(--tn-brand)", display: "inline-block", width: 10, height: 10, borderRadius: "50%", marginRight: 6 }} />{proName(p)}</strong><small>{p.role_label || ""}{p.matricula_text ? ` · ${p.matricula_text}` : ""}</small></td>
              <td>{p.schedule && p.schedule.length ? summarize(p.schedule) : <Pill tone="orange">Sin horario</Pill>}</td>
              <td>{p.active ? <Pill tone="green">Activo</Pill> : <Pill tone="gray">Inactivo</Pill>}{p.active && !p.bookable_online && <small>No se reserva online</small>}</td>
              {edit && <td className="num"><button className="secondary-button g1-small" onClick={() => setSched(p)}>Horarios</button>{" "}<button className="secondary-button g1-small" onClick={() => setOff(p)}>Ausencias</button>{" "}
                <button className="secondary-button g1-small" onClick={() => setOpen(p)} aria-label={`Editar ${proName(p)}`}><Icon name="edit" size={14} /></button></td>}
            </tr>))}</tbody></table></div>)}
      {open && <ProForm pro={open === "new" ? null : open} flash={flash} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
      {sched && <ScheduleModal pro={sched} flash={flash} onClose={() => setSched(null)} onSaved={() => { setSched(null); load(); }} />}
      {off && <TimeOffModal pro={off} flash={flash} onClose={() => setOff(null)} />}
    </div>
  );
}
const DAY3 = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
function summarize(s: NonNullable<Pro["schedule"]>): string {
  const by = new Map<string, number[]>();
  for (const x of s) { const k = `${x.start_time}-${x.end_time}`; by.set(k, [...(by.get(k) || []), x.weekday]); }
  return [...by.entries()].map(([k, d]) => `${d.map((i) => DAY3[i]).join(" ")} ${k.replace("-", " a ")}`).join(" · ");
}

function ProForm({ pro, flash, onClose, onSaved }: { pro: Pro | null; flash: Flash; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: pro?.name || "", display_name: pro?.display_name || "", role_label: pro?.role_label || "", color: pro?.color || "#ff7a59", bio: pro?.bio || "", active: pro?.active ?? true, online: pro?.bookable_online ?? true,
    commission: pro?.default_commission_pct != null ? String(pro.default_commission_pct) : "", matricula: pro?.matricula_text || "", libreta: pro?.libreta_expires_on || "" });
  const [error, setError] = useState("");
  const tattoo = !!getSessionUser()?.tattoo_mode;
  async function save() {
    if (f.name.trim().length < 2) return setError("Poné el nombre");
    const body = { name: f.name.trim(), display_name: f.display_name.trim() || null, role_label: f.role_label.trim() || null, color: f.color, photo: pro?.photo ?? null, bio: f.bio.trim() || null, active: f.active, bookable_online: f.online,
      sort: pro?.sort ?? 0, default_commission_pct: f.commission !== "" ? Number(f.commission) : null, matricula_text: f.matricula.trim() || null, libreta_expires_on: f.libreta || null };
    try { await appApi(pro ? `/professionals/${pro.id}` : "/professionals", { method: pro ? "PUT" : "POST", body }); flash.show("Guardado"); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
  }
  return (
    <Modal title={pro ? proName(pro) : "Nuevo integrante"} onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save}>Guardar</button></>}>
      <div className="g1-form">{error && <div className="g1-banner is-alert" role="alert"><div>{error}</div></div>}
        <div className="g1-form-grid">
          <Field label="Nombre completo"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Nombre que ve el cliente"><input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></Field>
          <Field label="Especialidad"><input value={f.role_label} onChange={(e) => setF({ ...f, role_label: e.target.value })} placeholder="Colorista" /></Field>
          <Field label="Color en la agenda"><input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} aria-label="Color" /></Field>
          <Field label="Comisión habitual (%)"><input type="number" min={0} max={100} value={f.commission} onChange={(e) => setF({ ...f, commission: e.target.value })} /></Field>
          <Field label="Matrícula"><input value={f.matricula} onChange={(e) => setF({ ...f, matricula: e.target.value })} /></Field>
          {tattoo && <Field label="Libreta sanitaria vence"><input type="date" value={f.libreta} onChange={(e) => setF({ ...f, libreta: e.target.value })} /></Field>}
          <Field label="Presentación" wide><input value={f.bio} maxLength={500} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
        </div>
        <label className="g1-check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /><span>Activo</span></label>
        <label className="g1-check"><input type="checkbox" checked={f.online} onChange={(e) => setF({ ...f, online: e.target.checked })} /><span>Se puede elegir en la web</span></label>
      </div>
    </Modal>
  );
}

interface SlotRow { start: string; end: string }
function ScheduleModal({ pro, flash, onClose, onSaved }: { pro: Pro; flash: Flash; onClose: () => void; onSaved: () => void }) {
  const [days, setDays] = useState<SlotRow[][]>(() => WEEKDAYS.map((_, d) => (pro.schedule || []).filter((s) => s.weekday === d).map((s) => ({ start: s.start_time, end: s.end_time }))));
  const [error, setError] = useState("");
  const setSlot = (d: number, i: number, patch: Partial<SlotRow>) => setDays((o) => o.map((r, k) => (k === d ? r.map((s, j) => (j === i ? { ...s, ...patch } : s)) : r)));
  function copyFrom(d: number) { setDays((o) => o.map((r, k) => (k !== d && k < 5 && d < 5 ? o[d].map((s) => ({ ...s })) : r))); }
  async function save() {
    const slots = days.flatMap((r, d) => r.map((s) => ({ weekday: d, start_time: s.start, end_time: s.end })));
    try { await appApi(`/professionals/${pro.id}/schedule`, { method: "PUT", body: { slots } }); flash.show("Horarios guardados"); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
  }
  return (
    <Modal title={`Horarios de ${proName(pro)}`} onClose={onClose} size="wide" footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save}>Guardar</button></>}>
      <div className="g1-form">{error && <div className="g1-banner is-alert" role="alert"><div>{error}</div></div>}
        <p className="tn-hint" style={{ marginTop: 0 }}>Agregá una franja por cada tramo en que atiende. Dos franjas el mismo día sirven para un corte al mediodía.</p>
        <div className="g1-week">{WEEKDAYS.map((name, d) => (
          <div className="g1-week-row" key={name}><strong>{name}</strong>
            <div>{days[d].length === 0 && <small className="tn-hint" style={{ display: "inline-block", marginBottom: 6 }}>No atiende</small>}
              {days[d].map((s, i) => (
                <div className="g1-slot-edit" key={i}>
                  <input type="time" aria-label={`${name} desde`} value={s.start} onChange={(e) => setSlot(d, i, { start: e.target.value })} /> a
                  <input type="time" aria-label={`${name} hasta`} value={s.end} onChange={(e) => setSlot(d, i, { end: e.target.value })} />
                  <button className="g1-icon-btn" onClick={() => setDays((o) => o.map((r, k) => (k === d ? r.filter((_, j) => j !== i) : r)))} aria-label={`Quitar franja del ${name}`}><Icon name="trash" size={15} /></button></div>))}
              <div className="g1-actions"><button className="secondary-button g1-small" onClick={() => setDays((o) => o.map((r, k) => (k === d ? [...r, { start: r.length ? r[r.length - 1].end : "10:00", end: "20:00" }] : r)))}><Icon name="plus" size={14} /> Franja</button>
                {d < 5 && days[d].length > 0 && <button className="secondary-button g1-small" onClick={() => copyFrom(d)}>Copiar a lunes-viernes</button>}</div></div>
          </div>))}</div>
      </div>
    </Modal>
  );
}

interface Off { id: number; from_at: string; to_at: string; reason: string | null; kind: string }
const OFF_LABEL: Record<string, string> = { VACACIONES: "Vacaciones", LICENCIA: "Licencia", BLOQUEO: "Bloqueo" };
function TimeOffModal({ pro, flash, onClose }: { pro: Pro; flash: Flash; onClose: () => void }) {
  const [rows, setRows] = useState<Off[]>([]);
  const [f, setF] = useState({ kind: "VACACIONES", from: "", to: "", reason: "" });
  const [error, setError] = useState("");
  const load = useCallback(() => appApi<Off[]>(`/professionals/${pro.id}/time-off`).then(setRows).catch(() => setRows([])), [pro.id]);
  useEffect(() => { load(); }, [load]);
  async function add() {
    if (!f.from || !f.to) return setError("Elegí desde y hasta cuándo");
    const a = new Date(`${f.from}T00:00:00`), b = new Date(`${f.to}T23:59:00`);
    if (b <= a) return setError("El fin tiene que ser posterior al inicio");
    try { await appApi(`/professionals/${pro.id}/time-off`, { method: "POST", body: { from_at: toLocalISO(a), to_at: toLocalISO(b), kind: f.kind, reason: f.reason.trim() || null } }); setF({ ...f, from: "", to: "", reason: "" }); setError(""); flash.show("Ausencia cargada"); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
  }
  async function del(id: number) { try { await appApi(`/professionals/${pro.id}/time-off/${id}`, { method: "DELETE" }); load(); } catch (e) { flash.fail(e); } }
  return (
    <Modal title={`Ausencias de ${proName(pro)}`} onClose={onClose} footer={<button className="secondary-button" onClick={onClose}>Cerrar</button>}>
      <div className="g1-form">{error && <div className="g1-banner is-alert" role="alert"><div>{error}</div></div>}
        <div className="g1-form-grid">
          <Field label="Tipo"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(OFF_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Motivo"><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          <Field label="Desde el día"><input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="Hasta el día (inclusive)"><input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field></div>
        <div className="g1-actions"><button className="primary-button g1-small" onClick={add}>Cargar ausencia</button></div>
        {rows.length > 0 && <ul className="g1-list">{rows.map((r) => (
          <li className="g1-item" key={r.id}><div className="g1-item-main"><strong>{OFF_LABEL[r.kind] || r.kind}</strong><small>{shortDate(r.from_at)} al {shortDate(r.to_at)}{r.reason ? ` · ${r.reason}` : ""}</small></div>
            <button className="secondary-button g1-small" onClick={() => del(r.id)} aria-label="Borrar ausencia"><Icon name="trash" size={14} /></button></li>))}</ul>}
      </div>
    </Modal>
  );
}

// ================= FERIADOS =================
interface Blocked { id: number; date: string; reason: string | null; professional_id: number | null }
export function Feriados({ flash }: { flash: Flash }) {
  const edit = canEdit();
  const [rows, setRows] = useState<Blocked[] | null>(null);
  const [pros, setPros] = useState<Pro[]>([]);
  const [f, setF] = useState({ date: "", reason: "", pro: "" });
  const [del, setDel] = useState<Blocked | null>(null);
  const load = useCallback(() => {
    appApi<Blocked[]>("/blocked-dates").then(setRows).catch((e) => { flash.fail(e); setRows([]); });
    appApi<Pro[]>("/professionals").then(setPros).catch(() => setPros([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const names = useMemo(() => Object.fromEntries(pros.map((p) => [p.id, proName(p)])), [pros]);
  async function add() {
    if (!f.date) return flash.show("Elegí el día", true);
    try { await appApi("/blocked-dates", { method: "POST", body: { date: f.date, reason: f.reason.trim() || null, professional_id: f.pro ? Number(f.pro) : null } }); setF({ date: "", reason: "", pro: "" }); flash.show("Día cerrado cargado"); load(); } catch (e) { flash.fail(e); }
  }
  if (!rows) return <Loading />;
  return (
    <div>
      {edit && <div className="tn-card" style={{ marginBottom: 16 }}><h2>Cerrar un día</h2><p className="tn-hint">Feriados, vacaciones del local o el día libre de una persona. Ese día no se ofrece horario online ni en la agenda.</p>
        <div className="g1-row" style={{ marginTop: 10 }}>
          <Field label="Día"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Motivo"><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Feriado" /></Field>
          <Field label="Para"><select value={f.pro} onChange={(e) => setF({ ...f, pro: e.target.value })}><option value="">Todo el local</option>{pros.map((p) => <option key={p.id} value={p.id}>{proName(p)}</option>)}</select></Field>
          <button className="primary-button" onClick={add}>Cerrar ese día</button></div></div>}
      {rows.length === 0 ? <Empty title="No hay días cerrados">Los feriados y cierres que cargues aparecen acá.</Empty> : (
        <ul className="g1-list">{rows.map((r) => (
          <li className="g1-item" key={r.id}><div className="g1-item-main"><strong>{shortDate(r.date)}</strong><small>{r.reason || "Cerrado"} · {r.professional_id ? names[r.professional_id] || "Una persona" : "Todo el local"}</small></div>
            {edit && <button className="secondary-button g1-small" onClick={() => setDel(r)} aria-label="Borrar día cerrado"><Icon name="trash" size={14} /></button>}</li>))}</ul>)}
      {del && <ConfirmModal title="Borrar día cerrado" confirmLabel="Borrar" danger onClose={() => setDel(null)} onConfirm={async () => { try { await appApi(`/blocked-dates/${del.id}`, { method: "DELETE" }); setDel(null); load(); } catch (e) { flash.fail(e); } }}>
        <p>¿Borrás el cierre del {shortDate(del.date)}?</p></ConfirmModal>}
    </div>
  );
}

// ================= SUGERIDOS DEL RUBRO =================
interface Preset { rubro: string; label: string; services: number; records: number; consents: number }
export function Sugeridos({ flash, onApplied }: { flash: Flash; onApplied: () => void }) {
  const isAdmin = getSessionUser()?.role === "ADMINISTRADOR";
  const [list, setList] = useState<Preset[] | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { appApi<Preset[]>("/company/presets").then(setList).catch(() => setList([])); setMine(getSessionUser()?.rubro || null); }, []);
  async function apply() {
    setBusy(true);
    try { const r = await appApi<{ added: Record<string, number>; detail: string }>("/company/apply-preset", { method: "POST", body: {} }); flash.show(`Se agregaron ${r.added.services} servicios. ${r.detail}`); setAsk(false); onApplied(); }
    catch (e) { flash.fail(e); } finally { setBusy(false); }
  }
  if (!list) return <Loading />;
  const p = list.find((x) => x.rubro === mine);
  return (
    <div className="tn-card">
      <h2>Servicios sugeridos de tu rubro</h2>
      {!p ? <p className="tn-hint">No encontramos sugeridos para tu rubro.</p> : (<>
        <p>Para <strong>{p.label}</strong> traemos {p.services} servicios (con sus fases y tiempos de espera), {p.records} fichas y {p.consents} consentimientos.</p>
        <p className="tn-hint">Nunca borra ni pisa lo que ya cargaste. Los precios vienen en $0: completalos vos.</p>
        {isAdmin ? <button className="primary-button" onClick={() => setAsk(true)}>Cargar sugeridos</button> : <p className="tn-hint">Esto lo carga el administrador del local.</p>}</>)}
      {ask && <ConfirmModal title="Cargar sugeridos" confirmLabel="Cargar" busy={busy} onClose={() => setAsk(false)} onConfirm={apply}><p>Se suman a los que ya tenés, sin borrar nada. ¿Seguimos?</p></ConfirmModal>}
    </div>
  );
}

// ================= RECURSOS (atajo) =================
export function RecursosHint() {
  const mods = splitList(getSessionUser()?.enabled_modules);
  if (!mods.includes("recursos")) return null;
  return <p className="tn-hint">Los sillones, cabinas y equipos se cargan en la sección «Recursos».</p>;
}
