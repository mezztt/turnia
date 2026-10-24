// Fidelización (G1): cumpleaños, clientes que no vuelven, puntos y premios, reseñas. Los mensajes se mandan a mano por WhatsApp.
import { useCallback, useEffect, useState } from "react";
import { appApi, getSessionUser, money, shortDate } from "../../config";
import { Empty, Field, Loading, Modal, Pill } from "../ui";
import Icon from "../Icons";
import { openWa } from "../agenda/types";

interface Flash { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }
const isBoss = () => ["ADMINISTRADOR", "ENCARGADO"].includes(getSessionUser()?.role || "");

export function Stars({ n }: { n: number }) {
  return <span className="g1-stars" role="img" aria-label={`${n} de 5`}>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? "" : "is-off"}><Icon name="star" size={15} /></span>)}</span>;
}

// ---------- cumpleaños ----------
interface Bday { customer_id: number; name: string; phone: string | null; date: string; turns: number; is_today: boolean; text: string; wa_url: string | null; has_whatsapp: boolean; sent: boolean }
export function Cumples({ flash, onChanged }: { flash: Flash; onChanged: () => void }) {
  const [rows, setRows] = useState<Bday[] | null>(null);
  const load = useCallback(() => appApi<{ items: Bday[] }>("/loyalty/birthdays").then((r) => setRows(r.items)).catch((e) => { flash.fail(e); setRows([]); }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  async function send(b: Bday) {
    openWa(b.wa_url);
    try { await appApi("/loyalty/sent", { method: "POST", body: { customer_id: b.customer_id, kind: "CUMPLE", text: b.text } }); load(); onChanged(); } catch (e) { flash.fail(e); }
  }
  if (!rows) return <Loading />;
  return (
    <div>
      <p className="tn-hint" style={{ marginTop: 0 }}>Hoy y los próximos 7 días. Solo aparecen quienes aceptaron recibir novedades; no se incluye a menores.</p>
      {rows.length === 0 ? <Empty title="No hay cumpleaños en estos días">Cuando un cliente que aceptó novedades cumpla años, lo ves acá con el saludo listo.</Empty> : (
        <ul className="g1-list">{rows.map((b) => (
          <li key={`${b.customer_id}-${b.date}`} className={`g1-item ${b.sent ? "is-done" : ""}`}>
            <div className="g1-item-main"><strong>{b.name} {b.is_today && <Pill tone="orange">Hoy</Pill>}</strong><small>Cumple {b.turns} el {shortDate(b.date)}{b.phone ? ` · ${b.phone}` : ""}</small><small>{b.text}</small></div>
            <div className="g1-item-actions">{b.sent ? <Pill tone="green">Saludado</Pill> : b.has_whatsapp
              ? <button className="primary-button g1-small" onClick={() => send(b)}><Icon name="message" size={15} /> Saludar por WhatsApp</button> : <Pill tone="orange">Sin WhatsApp</Pill>}</div>
          </li>))}</ul>)}
    </div>
  );
}

// ---------- inactivos ----------
interface Inact { customer_id: number; name: string; phone: string | null; last_visit_at: string | null; days_since: number; visits_count: number; text: string; wa_url: string | null; has_whatsapp: boolean; sent: boolean }
export function Inactivos({ flash, onChanged }: { flash: Flash; onChanged: () => void }) {
  const [days, setDays] = useState(60);
  const [rows, setRows] = useState<Inact[] | null>(null);
  const load = useCallback(() => appApi<{ items: Inact[] }>(`/loyalty/inactive?days=${days}`).then((r) => setRows(r.items)).catch((e) => { flash.fail(e); setRows([]); }), [days]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRows(null); load(); }, [load]);
  async function send(b: Inact) {
    openWa(b.wa_url);
    try { await appApi("/loyalty/sent", { method: "POST", body: { customer_id: b.customer_id, kind: "REACTIVACION", text: b.text } }); load(); onChanged(); } catch (e) { flash.fail(e); }
  }
  return (
    <div>
      <div className="g1-bar"><p className="tn-hint" style={{ margin: 0 }}>Clientes que aceptaron novedades, vinieron alguna vez y no tienen un turno por venir.</p>
        <label className="g1-bar-group"><span style={{ fontSize: 13 }}>No vienen hace más de</span>
          <select aria-label="Días sin venir" value={days} onChange={(e) => setDays(Number(e.target.value))} className="g1-datepick">{[30, 45, 60, 90, 120, 180].map((d) => <option key={d} value={d}>{d} días</option>)}</select></label></div>
      {!rows ? <Loading /> : rows.length === 0 ? <Empty title="Nadie para reactivar">No hay clientes con esa antigüedad sin turno.</Empty> : (
        <ul className="g1-list">{rows.map((b) => (
          <li key={b.customer_id} className={`g1-item ${b.sent ? "is-done" : ""}`}>
            <div className="g1-item-main"><strong>{b.name}</strong><small>Hace {b.days_since} días · {b.visits_count} {b.visits_count === 1 ? "visita" : "visitas"}{b.phone ? ` · ${b.phone}` : ""}</small><small>{b.text}</small></div>
            <div className="g1-item-actions">{b.sent ? <Pill tone="green">Invitado</Pill> : b.has_whatsapp
              ? <button className="primary-button g1-small" onClick={() => send(b)}><Icon name="message" size={15} /> Invitar por WhatsApp</button> : <Pill tone="orange">Sin WhatsApp</Pill>}</div>
          </li>))}</ul>)}
    </div>
  );
}

// ---------- puntos y premios ----------
interface Reward { id: number; name: string; points_cost: number; kind: string; value: number; service_id: number | null; product_id: number | null; active: boolean }
interface Overview { rule: { per_pesos: number; points: number }; customers: { id: number; name: string; phone: string | null; balance: number }[] }
interface Ledger { id: number; kind: string; points: number; note: string | null; created_at: string | null }
interface CustPts { customer: { id: number; name: string }; balance: number; ledger: Ledger[]; rewards: (Reward & { can_redeem: boolean })[] }
const KIND_LABEL: Record<string, string> = { DESCUENTO_PCT: "Descuento en %", DESCUENTO_MONTO: "Descuento en $", SERVICIO: "Servicio de regalo", PRODUCTO: "Producto de regalo" };
const LEDGER_LABEL: Record<string, string> = { GANA: "Suma", CANJEA: "Canje", AJUSTE: "Ajuste", VENCE: "Vencen", REVIERTE: "Anulado" };

export function Puntos({ flash }: { flash: Flash }) {
  const boss = isBoss();
  const [ov, setOv] = useState<Overview | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [q, setQ] = useState("");
  const [rule, setRule] = useState({ per: "", pts: "" });
  const [cust, setCust] = useState<number | null>(null);
  const [edit, setEdit] = useState<Reward | "new" | null>(null);
  const load = useCallback(() => {
    appApi<Overview>(`/loyalty/overview?q=${encodeURIComponent(q)}`).then((o) => { setOv(o); setRule({ per: String(o.rule.per_pesos), pts: String(o.rule.points) }); }).catch((e) => { flash.fail(e); });
    appApi<Reward[]>("/rewards").then(setRewards).catch(() => setRewards([]));
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = window.setTimeout(load, 200); return () => window.clearTimeout(t); }, [load]);
  async function saveRule() {
    try { await appApi("/loyalty/rule", { method: "PUT", body: { per_pesos: Number(rule.per), points: Number(rule.pts) } }); flash.show("Regla guardada"); load(); } catch (e) { flash.fail(e); }
  }
  if (!ov) return <Loading />;
  return (
    <div className="tn-grid-2">
      <div className="tn-card">
        <h2>Cómo se suman los puntos</h2>
        {boss ? (
          <div className="g1-row" style={{ marginTop: 10 }}>
            <Field label="Puntos"><input type="number" min={0} value={rule.pts} onChange={(e) => setRule({ ...rule, pts: e.target.value })} /></Field>
            <Field label="Cada cuántos pesos"><input type="number" min={1} value={rule.per} onChange={(e) => setRule({ ...rule, per: e.target.value })} /></Field>
            <button className="primary-button" onClick={saveRule}>Guardar</button>
          </div>) : <p>{ov.rule.points} punto(s) cada {money(ov.rule.per_pesos)}.</p>}
        <p className="tn-hint">Se calculan sobre lo pagado, sin propinas, y no se suman por pagar con un pack o con saldo a favor.</p>
        <h2 style={{ marginTop: 18 }}>Clientes con puntos</h2>
        <input aria-label="Buscar cliente" placeholder="Buscar por nombre" value={q} onChange={(e) => setQ(e.target.value)} className="g1-datepick" style={{ width: "100%", margin: "8px 0" }} />
        {ov.customers.length === 0 ? <p className="tn-hint">Todavía nadie tiene puntos.</p> : (
          <ul className="g1-list">{ov.customers.map((c) => (
            <li key={c.id} className="g1-item"><div className="g1-item-main"><strong>{c.name}</strong><small>{c.phone || ""}</small></div>
              <button className="secondary-button g1-small" onClick={() => setCust(c.id)}>{c.balance} pts · Ver</button></li>))}</ul>)}
      </div>
      <div className="tn-card">
        <div className="tn-card-head"><div><h2>Premios</h2><p>Lo que se puede canjear con puntos.</p></div>
          {boss && <button className="primary-button g1-small" onClick={() => setEdit("new")}><Icon name="plus" size={15} /> Nuevo premio</button>}</div>
        {rewards.length === 0 ? <p className="tn-hint">No hay premios cargados.</p> : (
          <ul className="g1-list">{rewards.map((r) => (
            <li key={r.id} className={`g1-item ${r.active ? "" : "is-done"}`}><div className="g1-item-main"><strong>{r.name}</strong>
              <small>{r.points_cost} puntos · {KIND_LABEL[r.kind]}{r.kind === "DESCUENTO_PCT" ? ` ${r.value}%` : r.kind === "DESCUENTO_MONTO" ? ` ${money(r.value)}` : ""}</small></div>
              {boss && <button className="secondary-button g1-small" onClick={() => setEdit(r)} aria-label={`Editar ${r.name}`}><Icon name="edit" size={14} /></button>}</li>))}</ul>)}
        <p className="tn-hint">Un premio en pesos se acredita como saldo a favor. Los demás se aplican en la caja con el motivo «Canje de puntos».</p>
      </div>
      {cust !== null && <CustomerPoints id={cust} flash={flash} onClose={() => setCust(null)} onChanged={load} />}
      {edit && <RewardForm reward={edit === "new" ? null : edit} flash={flash} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

export function CustomerPoints({ id, flash, onClose, onChanged }: { id: number; flash: Flash; onClose: () => void; onChanged: () => void }) {
  const boss = isBoss();
  const [d, setD] = useState<CustPts | null>(null);
  const [how, setHow] = useState("");
  const [adj, setAdj] = useState({ pts: "", note: "" });
  const load = useCallback(() => appApi<CustPts>(`/loyalty/customers/${id}`).then(setD).catch((e) => flash.fail(e)), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  async function redeem(rid: number) {
    try { const r = await appApi<{ how: string; loyalty: CustPts }>("/loyalty/redeem", { method: "POST", body: { customer_id: id, reward_id: rid } }); setHow(r.how); setD(r.loyalty); onChanged(); } catch (e) { flash.fail(e); }
  }
  async function adjust() {
    try { const r = await appApi<CustPts>("/loyalty/adjust", { method: "POST", body: { customer_id: id, points: Number(adj.pts), note: adj.note } }); setD(r); setAdj({ pts: "", note: "" }); onChanged(); flash.show("Ajuste hecho"); } catch (e) { flash.fail(e); }
  }
  return (
    <Modal title={d ? `Puntos de ${d.customer.name}` : "Puntos"} onClose={onClose} size="wide">
      {!d ? <Loading /> : (
        <div className="g1-form">
          <div className="g1-kpi-row"><div className="tn-card"><small>Saldo</small><strong style={{ fontSize: 26, display: "block" }}>{d.balance} puntos</strong></div></div>
          {how && <div className="g1-banner is-ok" role="status"><div>{how}</div></div>}
          <div className="g1-section"><h3>Canjear</h3>
            {d.rewards.length === 0 ? <p className="tn-hint">No hay premios activos.</p> : <ul className="g1-list">{d.rewards.map((r) => (
              <li key={r.id} className="g1-item"><div className="g1-item-main"><strong>{r.name}</strong><small>{r.points_cost} puntos</small></div>
                <button className="primary-button g1-small" disabled={!r.can_redeem} onClick={() => redeem(r.id)}>{r.can_redeem ? "Canjear" : `Faltan ${r.points_cost - d.balance}`}</button></li>))}</ul>}</div>
          {boss && <div className="g1-section"><h3>Ajuste manual</h3><div className="g1-row">
            <Field label="Puntos (+ o -)"><input type="number" value={adj.pts} onChange={(e) => setAdj({ ...adj, pts: e.target.value })} /></Field>
            <Field label="Motivo"><input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} /></Field>
            <button className="secondary-button" onClick={adjust} disabled={!adj.pts || adj.note.trim().length < 3}>Ajustar</button></div></div>}
          <div className="g1-section"><h3>Movimientos</h3>
            {d.ledger.length === 0 ? <p className="tn-hint">Sin movimientos.</p> : <ul className="g1-list">{d.ledger.map((l) => (
              <li key={l.id} className="g1-item"><div className="g1-item-main"><strong>{LEDGER_LABEL[l.kind] || l.kind}</strong><small>{l.note || ""} {l.created_at ? `· ${shortDate(l.created_at)}` : ""}</small></div>
                <strong>{l.points > 0 ? "+" : ""}{l.points}</strong></li>))}</ul>}</div>
        </div>)}
    </Modal>
  );
}

function RewardForm({ reward, flash, onClose, onSaved }: { reward: Reward | null; flash: Flash; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: reward?.name || "", cost: String(reward?.points_cost || 100), kind: reward?.kind || "DESCUENTO_PCT", value: String(reward?.value || ""), service_id: reward?.service_id ? String(reward.service_id) : "", product_id: reward?.product_id ? String(reward.product_id) : "", active: reward?.active ?? true });
  const [svcs, setSvcs] = useState<{ id: number; name: string }[]>([]);
  const [prods, setProds] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState("");
  const mods = (getSessionUser()?.enabled_modules || "").split(",");
  useEffect(() => {
    appApi<{ id: number; name: string }[]>("/services").then(setSvcs).catch(() => undefined);
    if (mods.includes("productos")) appApi<{ id: number; name: string }[]>("/products").then(setProds).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setError("");
    const body = { name: f.name.trim(), points_cost: Number(f.cost), kind: f.kind, value: Number(f.value) || 0, service_id: f.kind === "SERVICIO" && f.service_id ? Number(f.service_id) : null, product_id: f.kind === "PRODUCTO" && f.product_id ? Number(f.product_id) : null, active: f.active };
    try { await appApi(reward ? `/rewards/${reward.id}` : "/rewards", { method: reward ? "PUT" : "POST", body }); flash.show("Premio guardado"); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
  }
  return (
    <Modal title={reward ? "Editar premio" : "Nuevo premio"} onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save}>Guardar</button></>}>
      <div className="g1-form">{error && <div className="g1-banner is-alert" role="alert"><div>{error}</div></div>}
        <div className="g1-form-grid">
          <Field label="Nombre"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Puntos que cuesta"><input type="number" min={1} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
          <Field label="Tipo"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          {(f.kind === "DESCUENTO_PCT" || f.kind === "DESCUENTO_MONTO") && <Field label={f.kind === "DESCUENTO_PCT" ? "Porcentaje" : "Monto"}><input type="number" min={1} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>}
          {f.kind === "SERVICIO" && <Field label="Servicio"><select value={f.service_id} onChange={(e) => setF({ ...f, service_id: e.target.value })}><option value="">Elegir...</option>{svcs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
          {f.kind === "PRODUCTO" && <Field label="Producto"><select value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })}><option value="">Elegir...</option>{prods.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        </div>
        <label className="g1-check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /><span>Disponible para canjear</span></label>
      </div>
    </Modal>
  );
}

// ---------- reseñas ----------
interface Review { id: number; rating: number; comment: string | null; status: string; reply: string | null; received_at: string | null; professional: string | null; customer: string | null; date: string | null; services: string[] }
interface ReviewData { average: number | null; count: number; by_professional: { professional_id: number; name: string; average: number; count: number }[]; reviews: Review[] }
interface ToAsk { appointment_id: number; date: string; customer: string; has_whatsapp: boolean }
const RSTATUS: Record<string, [string, string]> = { RECIBIDA: ["Nueva", "blue"], PUBLICADA: ["Publicada", "green"], OCULTA: ["Oculta", "gray"] };

export function Resenas({ flash, onChanged }: { flash: Flash; onChanged: () => void }) {
  const role = getSessionUser()?.role || "";
  const front = role !== "PROFESIONAL";
  const boss = isBoss();
  const [d, setD] = useState<ReviewData | null>(null);
  const [ask, setAsk] = useState<ToAsk[]>([]);
  const [reply, setReply] = useState<Review | null>(null);
  const load = useCallback(() => {
    appApi<ReviewData>("/reviews").then(setD).catch((e) => { flash.fail(e); setD({ average: null, count: 0, by_professional: [], reviews: [] }); });
    if (front) appApi<ToAsk[]>("/reviews/pending-requests").then(setAsk).catch(() => setAsk([]));
  }, [front]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  async function setStatus(r: Review, status: string) {
    try { await appApi(`/reviews/${r.id}`, { method: "PUT", body: { status } }); load(); onChanged(); } catch (e) { flash.fail(e); }
  }
  async function request(a: ToAsk) {
    try { const r = await appApi<{ wa_url: string | null }>(`/reviews/request?appointment_id=${a.appointment_id}`, { method: "POST" }); openWa(r.wa_url); load(); }
    catch (e) { flash.fail(e); }
  }
  if (!d) return <Loading />;
  return (
    <div>
      <div className="g1-grid-cards" style={{ marginBottom: 16 }}>
        <div className="tn-card"><small>Promedio</small><strong style={{ display: "block", fontSize: 28 }}>{d.average !== null ? d.average.toFixed(1) : "-"}</strong>{d.average !== null && <Stars n={Math.round(d.average)} />}<small>{d.count} {d.count === 1 ? "reseña" : "reseñas"}</small></div>
        {d.by_professional.map((p) => <div key={p.professional_id ?? p.name} className="tn-card"><small>{p.name}</small><strong style={{ display: "block", fontSize: 22 }}>{p.average.toFixed(1)}</strong><small>{p.count} {p.count === 1 ? "reseña" : "reseñas"}</small></div>)}
      </div>
      {front && ask.length > 0 && (
        <div className="tn-card" style={{ marginBottom: 16 }}><h2>Pedir reseña</h2><p className="tn-hint">Turnos terminados esta semana sin reseña. Se abre WhatsApp con el mensaje listo.</p>
          <ul className="g1-list">{ask.slice(0, 12).map((a) => (
            <li key={a.appointment_id} className="g1-item"><div className="g1-item-main"><strong>{a.customer}</strong><small>Turno del {shortDate(a.date)}</small></div>
              {a.has_whatsapp ? <button className="secondary-button g1-small" onClick={() => request(a)}><Icon name="message" size={15} /> Pedir reseña</button> : <Pill tone="orange">Sin WhatsApp</Pill>}</li>))}</ul></div>
      )}
      {d.reviews.length === 0 ? <Empty title="Todavía no hay reseñas">Cuando un cliente conteste el link que le mandás, aparece acá.</Empty> : (
        <ul className="g1-list">{d.reviews.map((r) => (
          <li key={r.id} className="g1-item">
            <div className="g1-item-main"><strong><Stars n={r.rating} /> {r.customer || "Cliente"} <Pill tone={RSTATUS[r.status]?.[1] || "gray"}>{RSTATUS[r.status]?.[0] || r.status}</Pill></strong>
              <small>{r.services.join(" + ")}{r.professional ? ` · ${r.professional}` : ""}{r.date ? ` · ${shortDate(r.date)}` : ""}</small>
              {r.comment && <small style={{ color: "var(--tn-ink)" }}>{r.comment}</small>}
              {r.reply && <small>Tu respuesta: {r.reply}</small>}</div>
            {front && <div className="g1-item-actions">
              {boss && r.status !== "PUBLICADA" && <button className="secondary-button g1-small" onClick={() => setStatus(r, "PUBLICADA")}>Publicar</button>}
              {boss && r.status !== "OCULTA" && <button className="secondary-button g1-small" onClick={() => setStatus(r, "OCULTA")}>Ocultar</button>}
              <button className="secondary-button g1-small" onClick={() => setReply(r)}>Responder</button></div>}
          </li>))}</ul>)}
      {reply && <ReplyModal r={reply} flash={flash} onClose={() => setReply(null)} onSaved={() => { setReply(null); load(); onChanged(); }} />}
    </div>
  );
}

function ReplyModal({ r, flash, onClose, onSaved }: { r: Review; flash: Flash; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(r.reply || "");
  async function save() { try { await appApi(`/reviews/${r.id}`, { method: "PUT", body: { reply: text } }); flash.show("Respuesta guardada"); onSaved(); } catch (e) { flash.fail(e); } }
  return (
    <Modal title="Responder reseña" onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={save}>Guardar</button></>}>
      <div className="g1-form"><p className="tn-hint" style={{ marginTop: 0 }}>{r.comment || "Sin comentario"}</p>
        <Field label="Tu respuesta"><textarea rows={4} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} /></Field></div>
    </Modal>
  );
}
