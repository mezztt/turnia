// Piezas de la pantalla de Clientes: formulario, detalle con historial, saldos y acciones de datos personales.
import { useState } from "react";
import { Link } from "react-router-dom";
import { appApi, getSessionUser, money, saveBlob, shortDate, splitList } from "../../config";
import { Empty, Field, Modal, Pill, Switch, Tabs, useFlash } from "../ui";
import { ConfirmModal } from "../r1/common";
import { ErrorNote, WaButton, dmy, dmyhm, errMsg, mlabel, useLoad } from "./common";

export interface Cust {
  id: number; name: string; phone: string | null; phone_wa: string | null; email: string | null; birthday: string | null; dni_text: string | null; address: string | null;
  notes: string | null; tags: string[]; source: string | null; data_consent_at: string | null; marketing_opt_in: boolean; no_show_count: number; late_cancel_count: number;
  visits_count: number; last_visit_at: string | null; require_deposit: boolean; blocked_online: boolean; is_minor: boolean; guardian_name: string | null;
  guardian_dni_text: string | null; guardian_phone: string | null; referral_code: string | null; credit_balance: number; active: boolean; anonymized: boolean; health_alert: boolean;
  health_flags?: { id: number; kind: string; text: string; severity: string }[];
  appointments?: { id: number; date: string; start_at: string; status: string; services: string[] }[];
}
const SOURCES: [string, string][] = [["", "Sin dato"], ["INSTAGRAM", "Instagram"], ["WHATSAPP", "WhatsApp"], ["REFERIDO", "Recomendado"], ["PASO", "Pasó por el local"], ["WEB", "Web"], ["OTRO", "Otro"]];
const APPT_LABEL: Record<string, [string, string]> = {
  PENDIENTE_SENIA: ["Espera seña", "orange"], CONFIRMADO: ["Confirmado", "blue"], EN_SALA: ["En sala", "violet"], EN_CURSO: ["En curso", "violet"],
  FINALIZADO: ["Finalizado", "green"], CANCELADO: ["Cancelado", "gray"], NO_SHOW: ["No vino", "red"],
};

export function CustomerForm({ c, tattoo, onClose, onSaved }: { c: Cust | null; tattoo: boolean; onClose: () => void; onSaved: (c: Cust) => void }) {
  const [f, setF] = useState({
    name: c?.name || "", phone: c?.phone || "", email: c?.email || "", birthday: c?.birthday || "", dni_text: c?.dni_text || "", address: c?.address || "",
    source: c?.source || "", tags: (c?.tags || []).join(", "), notes: c?.notes || "", data_consent: !!c?.data_consent_at, marketing_opt_in: c?.marketing_opt_in ?? false,
    require_deposit: c?.require_deposit ?? false, blocked_online: c?.blocked_online ?? false,
    guardian_name: c?.guardian_name || "", guardian_dni_text: c?.guardian_dni_text || "", guardian_phone: c?.guardian_phone || "",
  });
  const [err, setErr] = useState("");
  const [dup, setDup] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const limit = tattoo ? 21 : 18;
  const age = f.birthday ? Math.floor((Date.now() - new Date(f.birthday + "T12:00:00").getTime()) / (365.25 * 86400000)) : null;
  const minor = age !== null && age < limit;
  async function save(force = false) {
    setBusy(true); setErr(""); setDup(false);
    const nul = (s: string) => s.trim() || null;
    const body = {
      name: f.name.trim(), phone: nul(f.phone), email: nul(f.email), birthday: f.birthday || null, dni_text: nul(f.dni_text), address: nul(f.address), source: f.source || null,
      tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), notes: nul(f.notes), data_consent: f.data_consent, marketing_opt_in: f.marketing_opt_in,
      require_deposit: f.require_deposit, blocked_online: f.blocked_online, guardian_name: nul(f.guardian_name), guardian_dni_text: nul(f.guardian_dni_text), guardian_phone: nul(f.guardian_phone),
    };
    try {
      const r = c
        ? await appApi<Cust>(`/customers/${c.id}`, { method: "PUT", body })
        : await appApi<Cust>(force ? "/customers?force=true" : "/customers", { method: "POST", body });
      onSaved(r);
    } catch (e) {
      const m = errMsg(e);
      setErr(m);
      if (!c && m.startsWith("Ya hay un cliente con ese teléfono")) setDup(true);
    } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="CLIENTES" title={c ? "Editar cliente" : "Nuevo cliente"} size="wide" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button>
        {dup ? <button className="primary-button" onClick={() => save(true)} disabled={busy}>Guardar igual</button> : <button className="primary-button" onClick={() => save()} disabled={busy || f.name.trim().length < 2}>Guardar</button>}</>}>
      <ErrorNote text={err} />
      <div className="tn-grid-form">
        <Field label="Nombre y apellido"><input value={f.name} maxLength={150} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
        <Field label="Teléfono / WhatsApp" hint="Con código de área, sin 0 ni 15. Lo usan los botones de WhatsApp."><input inputMode="tel" value={f.phone} maxLength={40} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Fecha de nacimiento"><input type="date" value={f.birthday} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("birthday", e.target.value)} /></Field>
        <Field label="DNI"><input value={f.dni_text} maxLength={20} onChange={(e) => set("dni_text", e.target.value)} /></Field>
        <Field label="Email"><input type="email" value={f.email} maxLength={255} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Cómo nos conoció"><select value={f.source} onChange={(e) => set("source", e.target.value)}>{SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Etiquetas" hint="Separadas por coma. Ej.: vip, color, alérgica al látex" wide><input value={f.tags} onChange={(e) => set("tags", e.target.value)} /></Field>
        <Field label="Notas" wide><textarea rows={2} value={f.notes} maxLength={2000} onChange={(e) => set("notes", e.target.value)} /></Field>
        {minor && (
          <div className="tn-note tn-note-warn" style={{ gridColumn: "1 / -1" }}>
            Es menor de {limit} años{tattoo ? " (en tatuajes y piercing el límite es 21)" : ""}: para atenderlo hace falta un tutor y su consentimiento firmado.
          </div>)}
        {minor && <>
          <Field label="Tutor: nombre"><input value={f.guardian_name} maxLength={150} onChange={(e) => set("guardian_name", e.target.value)} /></Field>
          <Field label="Tutor: DNI"><input value={f.guardian_dni_text} maxLength={20} onChange={(e) => set("guardian_dni_text", e.target.value)} /></Field>
          <Field label="Tutor: teléfono"><input value={f.guardian_phone} maxLength={40} onChange={(e) => set("guardian_phone", e.target.value)} /></Field></>}
        <div style={{ gridColumn: "1 / -1" }} className="tn-stack">
          <Switch on={f.data_consent} onChange={(b) => set("data_consent", b)} label="Aceptó el tratamiento de sus datos" hint="Se guarda la fecha. Sin esto no se cargan datos de salud." />
          <Switch on={f.marketing_opt_in} onChange={(b) => set("marketing_opt_in", b)} label="Acepta recibir novedades y saludos" hint="Para cumpleaños y reactivación. Los recordatorios de turno no dependen de esto." />
          <Switch on={f.require_deposit} onChange={(b) => set("require_deposit", b)} label="Pedirle seña para reservar" hint="Aunque el servicio no la pida. No lo bloquea." />
          <Switch on={f.blocked_online} onChange={(b) => set("blocked_online", b)} label="No puede reservar por la web" hint="Solo puede reservar el local." />
        </div>
      </div>
    </Modal>
  );
}

interface SaleLite { id: number; number: number; status: string; total: number; date: string; summary: string; methods: string[] }
interface PackBal { packs: { id: number; name: string; sessions_left: number; sessions_total: number; expires_on: string | null; status: string }[]; memberships: { id: number; plan_name: string | null; status: string; paid_until: string | null }[]; credit_balance: number }

export function CustomerDetail({ id, tattoo, onClose, onEdit, onChanged }: { id: number; tattoo: boolean; onClose: () => void; onEdit: (c: Cust) => void; onChanged: () => void }) {
  const user = getSessionUser();
  const flash = useFlash();
  const mods = splitList(user?.enabled_modules);
  const role = user?.role;
  const boss = role === "ADMINISTRADOR" || role === "ENCARGADO";
  const front = role !== "PROFESIONAL";
  const { data: c, error, reload } = useLoad<Cust>(`/customers/${id}`);
  const hasCaja = mods.includes("caja") && front;
  const hasPacks = mods.includes("packs");
  const sales = useLoad<SaleLite[]>(hasCaja ? `/sales?customer_id=${id}&limit=20` : null);
  const bal = useLoad<PackBal>(hasPacks ? `/customers/${id}/packs` : null);
  const [tab, setTab] = useState<"turnos" | "ventas" | "saldos">("turnos");
  const [ask, setAsk] = useState<"anon" | "forgive" | null>(null);
  const [anonErr, setAnonErr] = useState("");

  async function patch(body: Record<string, unknown>, ok: string) {
    try { await appApi(`/customers/${id}`, { method: "PUT", body }); await reload(); onChanged(); flash.show(ok); } catch (e) { flash.fail(e); }
  }
  async function forgive() {
    setAsk(null);
    try { await appApi(`/customers/${id}/forgive-noshow`, { method: "POST" }); await reload(); onChanged(); flash.show("Ausencias perdonadas"); } catch (e) { flash.fail(e); }
  }
  async function anonymize() {
    try { await appApi(`/customers/${id}/anonymize`, { method: "POST" }); setAsk(null); onChanged(); onClose(); } catch (e) { setAnonErr(errMsg(e)); }
  }
  async function exportData() {
    try { const d = await appApi<unknown>(`/customers/${id}/export`); saveBlob(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }), `datos-cliente-${id}.json`); flash.show("Archivo descargado"); } catch (e) { flash.fail(e); }
  }
  if (!c) return <Modal title="Cliente" onClose={onClose}><ErrorNote text={error} />{!error && <p className="tn-muted">Cargando...</p>}</Modal>;
  const wa = `Hola ${c.name.split(" ")[0]}, te escribimos de ${user?.company_name || "el local"}.`;
  return (
    <Modal eyebrow="CLIENTE" title={c.name} size="xl" onClose={onClose}
      footer={<>{front && <button className="secondary-button" onClick={() => onEdit(c)}>Editar</button>}<button className="primary-button" onClick={onClose}>Cerrar</button></>}>
      <div className="g3-cust-head">
        <div className="tn-row">
          {c.health_alert && <Pill tone="red">Tiene alertas de salud: ver ficha</Pill>}
          {c.is_minor && <Pill tone="orange">Menor de edad</Pill>}
          {c.no_show_count > 0 && <Pill tone="red">{c.no_show_count} ausencia{c.no_show_count > 1 ? "s" : ""}</Pill>}
          {c.late_cancel_count > 0 && <Pill tone="orange">{c.late_cancel_count} cancelación{c.late_cancel_count > 1 ? "es" : ""} tardía{c.late_cancel_count > 1 ? "s" : ""}</Pill>}
          {c.require_deposit && <Pill tone="violet">Se le pide seña</Pill>}
          {c.blocked_online && <Pill tone="gray">No reserva por la web</Pill>}
          {c.credit_balance > 0 && <Pill tone="green">Saldo a favor {money(c.credit_balance)}</Pill>}
          {c.tags.map((t) => <Pill key={t} tone="brand">{t}</Pill>)}
        </div>
        <div className="tn-row">
          <WaButton phoneWa={c.phone_wa} text={wa} />
          {mods.includes("fichas") && role !== "RECEPCION" && <Link className="secondary-button g3-small g3-link-btn" to={`/app/fichas?cliente=${c.id}`}>Abrir ficha</Link>}
          {front && <button className="secondary-button g3-small" onClick={() => patch({ name: c.name, require_deposit: !c.require_deposit }, c.require_deposit ? "Ya no se le pide seña" : "Desde ahora se le pide seña")}>{c.require_deposit ? "Sacar seña obligatoria" : "Pedir seña"}</button>}
          {boss && (c.no_show_count > 0 || c.late_cancel_count > 0) && <button className="secondary-button g3-small" onClick={() => setAsk("forgive")}>Perdonar ausencias</button>}
        </div>
      </div>
      <div className="tn-grid-2" style={{ marginTop: 14 }}>
        <div className="tn-card">
          <h2>Datos</h2>
          <dl className="g3-dl">
            <dt>Teléfono</dt><dd>{c.phone || "—"}</dd><dt>Email</dt><dd>{c.email || "—"}</dd>
            <dt>Cumpleaños</dt><dd>{c.birthday ? dmy(c.birthday) : "—"}</dd><dt>DNI</dt><dd>{c.dni_text || "—"}</dd>
            <dt>Cómo nos conoció</dt><dd>{SOURCES.find(([k]) => k === (c.source || ""))?.[1]}</dd>
            <dt>Visitas</dt><dd>{c.visits_count}{c.last_visit_at ? ` · última el ${dmy(c.last_visit_at)}` : ""}</dd>
            <dt>Datos personales</dt><dd>{c.data_consent_at ? `Aceptó el ${dmy(c.data_consent_at)}` : "Sin consentimiento registrado"}</dd>
            <dt>Novedades</dt><dd>{c.marketing_opt_in ? "Acepta" : "No acepta"}</dd>
            {c.is_minor && <><dt>Tutor</dt><dd>{c.guardian_name || "Falta cargar"}{c.guardian_dni_text ? ` · DNI ${c.guardian_dni_text}` : ""}</dd></>}
          </dl>
          {c.notes && <p className="tn-hint">Notas: {c.notes}</p>}
          {tattoo && c.is_minor && <p className="tn-hint">En tatuajes y piercing, un menor de 21 necesita al menos la autorización firmada de su tutor.</p>}
        </div>
        <div className="tn-card">
          {c.health_flags && c.health_flags.length > 0 ? (
            <>
              <h2>Alertas de salud</h2>
              <ul className="tn-list">{c.health_flags.map((h) => <li key={h.id}><div className="tn-list-main"><strong>{h.text}</strong><small>{h.kind.toLowerCase()}</small></div><Pill tone={h.severity === "GRAVE" ? "red" : "orange"}>{h.severity === "GRAVE" ? "Grave" : "Atención"}</Pill></li>)}</ul>
            </>) : (
            <>
              <h2>Salud</h2>
              <p className="tn-muted">{c.health_alert ? "Tiene alergias o contraindicaciones cargadas. El detalle lo ve el profesional o el encargado en la ficha." : "No hay alertas de salud cargadas."}</p>
            </>)}
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} options={[["turnos", "Turnos"], ...(hasCaja ? [["ventas", "Ventas"] as [typeof tab, string]] : []), ...(hasPacks ? [["saldos", "Packs y saldo"] as [typeof tab, string]] : [])]} />
      {tab === "turnos" && (
        (c.appointments || []).length === 0 ? <Empty title="Todavía no tiene turnos" /> : (
          <ul className="tn-list">
            {c.appointments!.map((a) => { const [l, t] = APPT_LABEL[a.status] || [a.status, "gray"]; return (
              <li key={a.id}><div className="tn-list-main"><strong>{dmyhm(a.start_at)}</strong><small>{a.services.join(", ") || "Sin servicios"}</small></div><Pill tone={t}>{l}</Pill></li>); })}
          </ul>))}
      {tab === "ventas" && (
        sales.data && sales.data.length === 0 ? <Empty title="Todavía no tiene ventas" /> : (
          <ul className="tn-list">
            {(sales.data || []).map((s) => <li key={s.id}><div className="tn-list-main"><strong>#{s.number} · {dmy(s.date)}</strong><small>{s.summary} · {s.methods.map(mlabel).join(", ")}</small></div>
              <Pill tone={s.status === "COBRADA" ? "green" : s.status === "ANULADA" ? "red" : "orange"}>{s.status === "COBRADA" ? "Cobrada" : s.status === "ANULADA" ? "Anulada" : "Abierta"}</Pill><span className="tn-list-amount">{money(s.total)}</span></li>)}
          </ul>))}
      {tab === "saldos" && bal.data && (
        <div className="tn-stack">
          {bal.data.packs.length === 0 && bal.data.memberships.length === 0 && <Empty title="No tiene packs ni membresías" />}
          <ul className="tn-list">
            {bal.data.packs.map((p) => <li key={`p${p.id}`}><div className="tn-list-main"><strong>{p.name}</strong><small>{p.expires_on ? `Vence el ${shortDate(p.expires_on)}` : "No vence"}</small></div><span className="tn-list-amount">{p.sessions_left} de {p.sessions_total}</span></li>)}
            {bal.data.memberships.map((m) => <li key={`m${m.id}`}><div className="tn-list-main"><strong>Membresía {m.plan_name}</strong><small>{m.paid_until ? `Pagada hasta el ${shortDate(m.paid_until)}` : ""}</small></div><Pill tone={m.status === "ACTIVA" ? "green" : "gray"}>{m.status.toLowerCase()}</Pill></li>)}
          </ul>
          {bal.data.credit_balance > 0 && <p className="tn-hint">Saldo a favor: {money(bal.data.credit_balance)} (señas de turnos cancelados a tiempo).</p>}
        </div>)}
      {role === "ADMINISTRADOR" && (
        <div className="tn-card g3-privacy">
          <h2>Datos personales (Ley 25.326)</h2>
          <p className="tn-muted">El cliente puede pedir ver o borrar sus datos. Respondé dentro de los 10 días corridos.</p>
          <div className="tn-row"><button className="secondary-button" onClick={exportData}>Descargar todos sus datos</button><button className="tn-danger-button" onClick={() => { setAnonErr(""); setAsk("anon"); }}>Borrar datos personales</button></div>
        </div>)}
      {ask === "forgive" && <ConfirmModal title="¿Perdonar las ausencias?" confirmLabel="Perdonar" onConfirm={forgive} onClose={() => setAsk(null)}>El contador de ausencias y cancelaciones tardías vuelve a cero. Queda registrado quién lo hizo.</ConfirmModal>}
      {ask === "anon" && <ConfirmModal title="¿Borrar los datos personales?" confirmLabel="Borrar" danger onConfirm={anonymize} onClose={() => setAsk(null)}>
        Se reemplazan nombre, contacto y DNI, y se borran salud y fotos. Las ventas quedan sin nombre para los reportes. No se puede deshacer.
        {anonErr && <div className="tn-note tn-note-error" style={{ marginTop: 10 }}>{anonErr}</div>}</ConfirmModal>}
      {flash.node}
    </Modal>
  );
}
