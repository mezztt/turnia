import { useState } from "react";
import { Link } from "react-router-dom";
import { dateTime, publicApi } from "../../config";

interface Receipt { code: string; kind: string; requested_at: string; venue_name: string; name: string; contact: string; detail: string }

/**
 * Botones de baja y de arrepentimiento (Disposición 954/2025) de las webs públicas del local (turnos online y vitrina).
 * Sin sesión: el cliente deja nombre y contacto, y recibe una constancia con fecha, hora y código.
 * El local lo ve en Configuración → Botones de baja y arrepentimiento y en sus notificaciones. No reemplaza el asesoramiento de un profesional (ver LEGAL.md).
 */
export function ConsumerButtons({ slug }: { slug: string }) {
  const [kind, setKind] = useState<"ARREPENTIMIENTO" | "BAJA" | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [reference, setReference] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  async function send() {
    if (!kind) return;
    setBusy(true); setError("");
    try {
      setReceipt(await publicApi<Receipt>(`/public/${slug}/distance-requests`, { method: "POST", body: {
        kind, name: name.trim(), contact: contact.trim(), subject_type: "TURNO", reference: reference.trim() || null, detail: detail.trim() || null,
      } }));
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos registrar tu pedido"); } finally { setBusy(false); }
  }

  if (receipt) {
    return (
      <div className="pb-card" role="status">
        <span className="pb-step-label">Constancia · {receipt.kind === "BAJA" ? "Baja" : "Arrepentimiento"}</span>
        <p style={{ margin: "0 0 6px" }}><b>Código {receipt.code}</b></p>
        <p className="tn-pub-legal" style={{ marginTop: 0 }}>
          {receipt.venue_name} · {dateTime(receipt.requested_at)}<br />
          {receipt.name} · {receipt.contact}
        </p>
        <p className="tn-pub-legal">{receipt.detail}</p>
        <button className="pb-btn pb-btn-ghost" type="button" onClick={() => window.print()}>Imprimir o guardar la constancia</button>
      </div>
    );
  }
  const ready = name.trim().length >= 2 && contact.trim().length >= 5;
  return (
    <div className="pb-card">
      <span className="pb-step-label">Baja y arrepentimiento</span>
      <p className="tn-pub-legal" style={{ marginTop: 0 }}>Si contrataste algo a distancia con este local (un turno, un pack o una membresía), podés pedir la baja o arrepentirte desde acá, sin registro previo. Te damos una constancia con fecha, hora y código y el local te responde en 24 horas. Los servicios ya prestados no se devuelven. Más info: <Link to="/legal/baja">Baja y arrepentimiento</Link> (Disposición 954/2025).</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className={`pb-btn pb-btn-ghost ${kind === "ARREPENTIMIENTO" ? "is-on" : ""}`} type="button" aria-pressed={kind === "ARREPENTIMIENTO"} onClick={() => setKind(kind === "ARREPENTIMIENTO" ? null : "ARREPENTIMIENTO")}>Botón de arrepentimiento</button>
        <button className={`pb-btn pb-btn-ghost ${kind === "BAJA" ? "is-on" : ""}`} type="button" aria-pressed={kind === "BAJA"} onClick={() => setKind(kind === "BAJA" ? null : "BAJA")}>Botón de baja</button>
      </div>
      {kind && (
        <div style={{ marginTop: 14 }}>
          <div className="pb-field"><label htmlFor="cr-nombre">Tu nombre</label><input id="cr-nombre" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
          <div className="pb-field"><label htmlFor="cr-contacto">Email o teléfono para responderte</label><input id="cr-contacto" value={contact} maxLength={160} onChange={(e) => setContact(e.target.value)} autoComplete="email" /></div>
          <div className="pb-field"><label htmlFor="cr-ref">Fecha del turno o código de tu pack (opcional)</label><input id="cr-ref" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} /></div>
          <div className="pb-field"><label htmlFor="cr-detalle">Comentario (opcional)</label><textarea id="cr-detalle" rows={2} value={detail} maxLength={500} onChange={(e) => setDetail(e.target.value)} /></div>
          {error && <div className="pb-error" role="alert">{error}</div>}
          <button className="pb-btn" type="button" disabled={!ready || busy} onClick={send}>{busy ? "Enviando..." : kind === "BAJA" ? "Pedir la baja" : "Confirmar arrepentimiento"}</button>
        </div>
      )}
    </div>
  );
}
