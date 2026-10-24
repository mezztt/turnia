// Detalle de un turno: estado, seña, mensajes por WhatsApp y acciones (llegó, empezar, finalizar, no vino, cancelar, cobrar).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { appApi, getSessionUser, hhmm, longDate, money, splitList, timeRange, vocab } from "../../config";
import { ConfirmModal } from "../r1/common";
import { Field, Loading, Modal, Pill } from "../ui";
import Icon from "../Icons";
import { ALERT_ICON, DEPOSIT_LABEL, SOURCE_LABEL, STATUS_LABEL, STATUS_TONE, openWa, waLink } from "./types";
import type { Appt } from "./types";

interface Flash { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }
type Modal_ = null | "cancel" | "deposit" | "refund" | "ack" | "nosena";

const METHODS: [string, string][] = [["EFECTIVO", "Efectivo"], ["TRANSFERENCIA", "Transferencia"], ["DEBITO", "Débito"], ["CREDITO", "Crédito"], ["QR", "QR"], ["SALDO_A_FAVOR", "Saldo a favor del cliente"], ["OTRO", "Otro"]];

export default function AppointmentDetail({ id, proNames, graceMin, freeHours, flash, onClose, onChanged, onEdit }: {
  id: number; proNames: Record<number, string>; graceMin: number; freeHours: number; flash: Flash; onClose: () => void; onChanged: () => void; onEdit: (a: Appt) => void;
}) {
  const user = getSessionUser();
  const v = vocab(user);
  const navigate = useNavigate();
  const mods = splitList(user?.enabled_modules);
  const role = user?.role || "";
  const write = ["ADMINISTRADOR", "ENCARGADO", "RECEPCION"].includes(role);
  const boss = ["ADMINISTRADOR", "ENCARGADO"].includes(role);
  const [a, setA] = useState<Appt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal_>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [blocked, setBlocked] = useState(false);

  const load = useCallback(() => appApi<Appt>(`/appointments/${id}`).then(setA).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const apply = (r: { appointment: Appt }) => { setA(r.appointment); onChanged(); };

  async function act(action: string, extra: Record<string, unknown> = {}, okText?: string) {
    setBusy(true); setError(""); setBlocked(false);
    try {
      const r = await appApi<{ appointment: Appt; needs_ack?: boolean; warnings?: string[]; waitlist_candidates?: number; deposit_warning?: string }>(`/appointments/${id}/status`, { method: "POST", body: { action, ...extra } });
      if (r.needs_ack) { setWarnings(r.warnings || []); setModal("ack"); return; }
      apply(r);
      setModal(null);
      if (okText) flash.show(okText);
      if (r.waitlist_candidates) flash.show(`Se liberó un hueco: ${r.waitlist_candidates} persona(s) en lista de espera pueden tomarlo`);
      if (r.deposit_warning) flash.show(r.deposit_warning, true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo hacer";
      setError(msg);
      if (action === "iniciar") setBlocked(true);
      setModal(null);
    } finally { setBusy(false); }
  }

  async function preview(kind: string) {
    try {
      const r = await appApi<{ text: string; wa_url: string | null; has_whatsapp: boolean }>(`/messages/preview?kind=${kind}&appointment_id=${id}`);
      if (!r.wa_url) return flash.show("Este cliente no tiene un WhatsApp válido: llamalo al " + (a?.customer?.phone || "teléfono cargado"), true);
      openWa(r.wa_url);
    } catch (e) { flash.fail(e); }
  }

  const grace = useMemo(() => (a ? new Date(a.start_at).getTime() + graceMin * 60000 : 0), [a, graceMin]);
  if (!a) return <Modal title={`Detalle del ${v.turno}`} onClose={onClose}>{error ? <div className="g1-banner is-alert" role="alert"><div>{error}</div></div> : <Loading />}</Modal>;

  const c = a.customer;
  const canNoShow = Date.now() >= grace;
  const live = ["PENDIENTE_SENIA", "CONFIRMADO", "EN_SALA"].includes(a.status);
  const proAct = !a.readonly && role === "PROFESIONAL";
  const remaining = Math.max(0, a.deposit_amount - (a.payments || []).filter((p) => p.status === "APROBADO").reduce((t, p) => t + p.amount, 0));
  const lateCancel = new Date(a.start_at).getTime() - Date.now() < freeHours * 3600000;
  const health = a.alerts.some((x) => x.key === "alergia");
  const canFichas = mods.includes("fichas") && role !== "RECEPCION";

  return (
    <>
      <Modal size="wide" eyebrow={`${longDate(new Date(a.start_at)).toUpperCase()} · ${timeRange(a.start_at, a.end_at)}`} title={c ? c.name : "Sin cliente"} onClose={onClose}
        footer={<button className="secondary-button" onClick={onClose}>Cerrar</button>}>
        <div className="g1-form">
          <div className="tn-row">
            <Pill tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status] || a.status}</Pill>
            <Pill tone="gray">{SOURCE_LABEL[a.source] || a.source}</Pill>
            {a.overbooked && <Pill tone="red">Sobreturno</Pill>}
            {a.deposit_required && <Pill tone={a.deposit_status === "PAGADA" ? "green" : a.deposit_status === "RETENIDA" ? "red" : "orange"}>{DEPOSIT_LABEL[a.deposit_status] || a.deposit_status}</Pill>}
            {c?.phone && <span className="tn-muted">{c.phone}</span>}
            {c && waLink(c.phone) && <a className="secondary-button g1-small" href={waLink(c.phone) || "#"} target="_blank" rel="noopener noreferrer"><Icon name="message" size={14} /> Abrir WhatsApp</a>}
          </div>
          {error && <div className="g1-banner is-alert" role="alert"><div><strong>No se pudo</strong>{error}
            {blocked && canFichas && c && <div style={{ marginTop: 8 }}><button className="secondary-button g1-small" onClick={() => navigate(`/app/fichas?cliente=${c.id}`)}>Ir a la ficha del cliente</button></div>}</div></div>}
          {a.alerts.length > 0 && (
            <div className="g1-banner is-warn"><div><strong>Para tener en cuenta</strong><ul>
              {a.alerts.map((al) => <li key={al.key}><Icon name={ALERT_ICON[al.key] || "alert"} size={13} /> {al.label}</li>)}
            </ul>{health && canFichas && c && <div style={{ marginTop: 6 }}><button className="secondary-button g1-small" onClick={() => navigate(`/app/fichas?cliente=${c.id}`)}>Ver ficha de salud</button></div>}</div></div>
          )}

          <div className="g1-section">
            <h3>Servicios</h3>
            {a.items.map((it) => (
              <div className="g1-svc-line" key={it.id}>
                <span className="g1-sw" style={{ background: it.color || "var(--tn-brand-c)" }} aria-hidden="true" />
                <span style={{ flex: 1 }}>{it.name}<small>{hhmm(it.start_at)}–{hhmm(it.end_at)} · {it.duration} min · {it.professional_id ? proNames[it.professional_id] || "Profesional" : "Sin asignar"}</small></span>
                <b>{money(it.price)}</b>
              </div>
            ))}
            <div className="g1-svc-line"><span>Total</span><b>{money(a.total)}</b></div>
          </div>
          {(a.notes || a.internal_notes || a.cancel_reason) && (
            <dl className="g1-dl">
              {a.notes && <><dt>Nota</dt><dd>{a.notes}</dd></>}
              {a.internal_notes && <><dt>Nota interna</dt><dd>{a.internal_notes}</dd></>}
              {a.cancel_reason && <><dt>Cancelación</dt><dd>{a.cancel_by === "LOCAL" ? "Canceló el local" : "Canceló el cliente"}: {a.cancel_reason}{a.late_cancel ? " (fuera de plazo)" : ""}</dd></>}
            </dl>
          )}

          {a.deposit_required && (
            <div className="g1-section">
              <h3>Seña</h3>
              <div className="tn-row"><b>{money(a.deposit_amount)}</b><span className="tn-muted">{DEPOSIT_LABEL[a.deposit_status]}{a.status === "PENDIENTE_SENIA" && a.hold_expires_at ? ` · se guarda el horario hasta las ${hhmm(a.hold_expires_at)}` : ""}</span></div>
              {(a.payments || []).map((p) => <small key={p.id} className="tn-muted">{p.method === "MERCADOPAGO" ? "Mercado Pago" : p.method.toLowerCase()} · {money(p.amount)} · {p.status === "APROBADO" ? "aprobado" : p.status === "PENDIENTE" ? "esperando el pago" : p.status.toLowerCase()}{p.reference ? ` · ${p.reference}` : ""}</small>)}
              {write && live && remaining > 0 && (
                <div className="g1-actions">
                  <button className="primary-button g1-small" onClick={() => setModal("deposit")}>Registrar seña</button>
                  {(a.payments || []).some((p) => p.method === "MERCADOPAGO" && p.status === "PENDIENTE") && <button className="secondary-button g1-small" onClick={async () => { try { const r = await appApi<{ paid: boolean; appointment: Appt }>(`/appointments/${id}/deposit/verify`, { method: "POST" }); apply(r); flash.show(r.paid ? "Mercado Pago confirmó el pago" : "Mercado Pago todavía no registra el pago"); } catch (e) { flash.fail(e); } }}>Verificar el pago</button>}
                  <button className="secondary-button g1-small" onClick={() => preview("SENIA")}>Reclamar seña por WhatsApp</button>
                </div>
              )}
              {boss && ["PAGADA", "RETENIDA", "DEVUELTA"].includes(a.deposit_status) && <div><button className="secondary-button g1-small" onClick={() => setModal("refund")}>Cambiar qué pasa con la seña</button></div>}
            </div>
          )}
          {!a.deposit_required && write && live && <div><button className="secondary-button g1-small" onClick={() => setModal("deposit")}><Icon name="coin" size={14} /> Pedir una seña</button></div>}

          <div className="g1-section">
            <h3>Acciones</h3>
            <div className="g1-actions">
              {write && a.status === "PENDIENTE_SENIA" && <button className="secondary-button" onClick={() => setModal("nosena")} disabled={busy}>Confirmar sin seña</button>}
              {write && a.status === "CONFIRMADO" && !a.confirmed_at && <button className="secondary-button" onClick={() => act("confirmar", {}, "Turno confirmado")} disabled={busy}><Icon name="check" size={14} /> El cliente confirmó</button>}
              {(write || proAct) && ["CONFIRMADO", "PENDIENTE_SENIA"].includes(a.status) && <button className="primary-button" onClick={() => act("llego", {}, "Marcado: llegó")} disabled={busy}>Llegó</button>}
              {(write || proAct) && ["CONFIRMADO", "EN_SALA"].includes(a.status) && <button className="primary-button" onClick={() => act("iniciar", {}, "En curso")} disabled={busy}>Empezar</button>}
              {(write || proAct) && ["EN_CURSO", "EN_SALA", "CONFIRMADO"].includes(a.status) && <button className={a.status === "EN_CURSO" ? "primary-button" : "secondary-button"} onClick={() => act("finalizar", {}, "Turno finalizado")} disabled={busy}>Finalizar</button>}
              {write && ["CONFIRMADO", "EN_SALA", "PENDIENTE_SENIA"].includes(a.status) && <button className="secondary-button" disabled={busy || !canNoShow} title={canNoShow ? "" : `Se puede marcar pasados ${graceMin} minutos de la hora`} onClick={() => act("no_show", {}, "Marcado: no vino")}>No vino</button>}
              {write && live && <button className="secondary-button" onClick={() => onEdit(a)}><Icon name="edit" size={14} /> Editar o mover</button>}
              {write && live && <button className="tn-danger-button" onClick={() => setModal("cancel")}>Cancelar {v.turno}</button>}
              {write && ["EN_CURSO", "FINALIZADO"].includes(a.status) && mods.includes("caja") && <button className="primary-button" onClick={() => navigate("/app/caja")}><Icon name="wallet" size={14} /> {a.sale_id ? "Ver venta" : "Cobrar"}</button>}
              {write && !canNoShow && ["CONFIRMADO", "EN_SALA", "PENDIENTE_SENIA"].includes(a.status) && <small className="tn-muted" style={{ alignSelf: "center" }}>«No vino» se habilita a los {graceMin} min.</small>}
            </div>
          </div>

          {write && (
            <div className="g1-section">
              <h3>Mensajes por WhatsApp</h3>
              <div className="g1-actions">
                {live && <button className="secondary-button g1-small" onClick={() => preview("CONFIRMACION")}>Confirmación</button>}
                {live && <button className="secondary-button g1-small" onClick={() => preview("RECORDATORIO")}>Recordatorio</button>}
                {a.status === "FINALIZADO" && mods.includes("fidelizacion") && <button className="secondary-button g1-small" onClick={() => preview("RESENA")}>Pedir reseña</button>}
              </div>
              <small className="tn-muted">Se abre WhatsApp con el texto armado; lo enviás vos. Link del cliente: {a.link ? <button className="tn-link" onClick={() => { navigator.clipboard?.writeText(a.link || ""); flash.show("Link copiado"); }}>copiar</button> : "—"}</small>
            </div>
          )}
          {boss && c && c.no_show_count > 0 && (
            <div><button className="tn-link" onClick={async () => { try { const r = await appApi<{ detail: string }>(`/customers/${c.id}/forgive-noshow`, { method: "POST" }); flash.show(r.detail); load(); onChanged(); } catch (e) { flash.fail(e); } }}>Perdonar las {c.no_show_count} ausencia(s) de este cliente</button></div>
          )}
        </div>
      </Modal>

      {modal === "ack" && (
        <ConfirmModal title="Antes de empezar" confirmLabel="Empezar igual" busy={busy} onClose={() => setModal(null)} onConfirm={() => act("iniciar", { acknowledge: true }, "En curso")}>
          <ul style={{ margin: "0 0 8px", paddingLeft: 18 }}>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          Podés empezar igual: queda registrado que se siguió con estos avisos.
        </ConfirmModal>
      )}
      {modal === "nosena" && (
        <ConfirmModal title="Confirmar sin seña" confirmLabel="Confirmar igual" busy={busy} onClose={() => setModal(null)} onConfirm={() => act("confirmar", { waive_deposit: true }, "Turno confirmado")}>
          El {v.turno} queda confirmado aunque la seña de {money(a.deposit_amount)} no se pagó. Queda registrado.
        </ConfirmModal>
      )}
      {modal === "cancel" && <CancelModal a={a} late={lateCancel} boss={boss} busy={busy} freeHours={freeHours} onClose={() => setModal(null)} onSubmit={(body) => act("cancelar", body, "Turno cancelado")} />}
      {modal === "deposit" && <DepositModal a={a} remaining={remaining} hasMp={true} onClose={() => setModal(null)} onDone={(r) => { apply(r); setModal(null); load(); }} flash={flash} />}
      {modal === "refund" && <RefundModal a={a} onClose={() => setModal(null)} onDone={(r) => { apply(r); setModal(null); load(); flash.show("Seña actualizada"); }} flash={flash} />}
    </>
  );
}

function CancelModal({ a, late, boss, busy, freeHours, onClose, onSubmit }: {
  a: Appt; late: boolean; boss: boolean; busy: boolean; freeHours: number; onClose: () => void; onSubmit: (b: Record<string, unknown>) => void;
}) {
  const [by, setBy] = useState<"CLIENTE" | "LOCAL">("CLIENTE");
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState("");
  const hasDeposit = a.deposit_status === "PAGADA";
  const text = !hasDeposit ? "No hay seña paga: no hay nada que devolver ni retener."
    : by === "LOCAL" ? "Cancela el local: la seña se devuelve o queda a favor del cliente. Nunca se retiene."
      : late ? `Cancela con menos de ${freeHours} h de aviso: por política, la seña queda retenida (nunca más que la seña) y se suma una cancelación tardía.`
        : `Cancela con aviso (más de ${freeHours} h antes): la seña queda a favor del cliente o se devuelve, según la política del local.`;
  return (
    <Modal eyebrow="CANCELAR" title="Cancelar el turno" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button>
        <button className="tn-danger-button" disabled={busy} onClick={() => onSubmit({ by, reason: reason.trim() || undefined, outcome: outcome || undefined })}>{busy ? "Un momento..." : "Cancelar el turno"}</button></>}>
      <div className="g1-form">
        <div className="form-group"><label>¿Quién cancela?</label>
          <div className="tn-seg" role="radiogroup">
            <button type="button" className={by === "CLIENTE" ? "is-on" : ""} onClick={() => setBy("CLIENTE")}>El cliente avisó</button>
            <button type="button" className={by === "LOCAL" ? "is-on" : ""} onClick={() => setBy("LOCAL")}>Cancela el local</button>
          </div></div>
        <Field label="Motivo (opcional)"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={by === "LOCAL" ? "Ej.: la profesional está enferma" : "Ej.: le surgió algo"} /></Field>
        <div className="g1-banner is-info"><div>{text}</div></div>
        {boss && hasDeposit && (
          <Field label="Resolver la seña distinto a la política" hint="Solo encargado o dueño. Queda registrado.">
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="">Según la política</option>
              <option value="A_FAVOR">Dejar a favor del cliente</option>
              <option value="DEVUELTA">Devolver la seña</option>
              {by === "CLIENTE" && <option value="RETENIDA">Retener la seña</option>}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function DepositModal({ a, remaining, hasMp, onClose, onDone, flash }: {
  a: Appt; remaining: number; hasMp: boolean; onClose: () => void; onDone: (r: { appointment: Appt }) => void; flash: Flash;
}) {
  const [method, setMethod] = useState("EFECTIVO");
  const [amount, setAmount] = useState(String(remaining || ""));
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ link: string; text: string; wa_url: string | null } | null>(null);
  const asking = !a.deposit_required;
  async function submit(mp = false) {
    setBusy(true);
    try {
      const r = await appApi<{ appointment: Appt; link?: string; text?: string; wa_url?: string | null }>(`/appointments/${a.id}/deposit`, {
        method: "POST", body: { method: mp ? "MERCADOPAGO" : method, amount: amount ? Number(amount.replace(",", ".")) : undefined, reference: ref.trim() || undefined } });
      if (mp && r.link) { setLink({ link: r.link, text: r.text || "", wa_url: r.wa_url || null }); return; }
      onDone(r);
      flash.show(asking ? "Seña pedida" : "Seña registrada");
    } catch (e) { flash.fail(e); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="SEÑA" title={asking ? "Pedir una seña" : "Registrar la seña"} onClose={onClose}
      footer={link ? <button className="primary-button" onClick={() => onDone({ appointment: a })}>Listo</button> : <><button className="secondary-button" onClick={onClose}>Volver</button>
        {!asking && <button className="primary-button" disabled={busy} onClick={() => submit(false)}>{busy ? "Guardando..." : "Registrar seña"}</button>}
        {asking && <button className="primary-button" disabled={busy || !amount} onClick={() => submit(false)}>Pedir y registrar</button>}</>}>
      {link ? (
        <div className="g1-form">
          <div className="g1-banner is-ok"><div><strong>Link de Mercado Pago listo</strong>El turno se confirma solo cuando Mercado Pago acredita el pago (no alcanza con que el cliente vuelva a la página).</div></div>
          <div className="g1-actions">
            {link.wa_url ? <button className="primary-button" onClick={() => openWa(link.wa_url)}><Icon name="message" size={14} /> Enviar por WhatsApp</button> : <small className="tn-muted">El cliente no tiene WhatsApp válido: copiá el link.</small>}
            <button className="secondary-button" onClick={() => { navigator.clipboard?.writeText(link.link); flash.show("Link copiado"); }}>Copiar link</button>
          </div>
        </div>
      ) : (
        <div className="g1-form">
          {asking && <div className="g1-banner is-info"><div>Este {a.items.length ? "turno" : ""} no pedía seña. Poné el importe (no puede pasar del precio de {money(a.total)}).</div></div>}
          <div className="g1-form-grid">
            <Field label="Importe"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Medio"><select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Referencia (opcional)" hint="Nº de transferencia, últimos 4 de la tarjeta…"><input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={80} /></Field>
          </div>
          {hasMp && !asking && <div className="g1-actions"><button className="secondary-button" disabled={busy} onClick={() => submit(true)}>Generar link de Mercado Pago</button></div>}
        </div>
      )}
    </Modal>
  );
}

function RefundModal({ a, onClose, onDone, flash }: { a: Appt; onClose: () => void; onDone: (r: { appointment: Appt }) => void; flash: Flash }) {
  const [outcome, setOutcome] = useState("DEVUELTA");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try { onDone(await appApi(`/appointments/${a.id}/deposit/refund`, { method: "POST", body: { outcome, reason: reason.trim() || undefined } })); } catch (e) { flash.fail(e); } finally { setBusy(false); }
  }
  return (
    <Modal eyebrow="SEÑA" title="Qué pasa con la seña" onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button><button className="primary-button" disabled={busy} onClick={submit}>Guardar</button></>}>
      <div className="g1-form">
        <Field label="Resolución"><select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="DEVUELTA">Devuelta (la devolvés por Mercado Pago o transferencia y la dejás asentada acá)</option>
          <option value="A_FAVOR">A favor del cliente (la usa en otro turno)</option>
          <option value="RETENIDA">Retenida (nunca más que la seña)</option></select></Field>
        <Field label="Motivo"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></Field>
      </div>
    </Modal>
  );
}
