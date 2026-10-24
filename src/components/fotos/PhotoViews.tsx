// Galería, detalle y comparador antes/después (grupo G2). Las imágenes se piden con el token en el encabezado.
import { useState } from "react";
import { appApi, dateTime } from "../../config";
import { Field, Modal, Pill } from "../ui";
import { ConfirmModal } from "../r1/common";
import { ProtectedImg, useBlobUrl } from "../fichas/shared";
import { PHOTO_KIND_LABEL } from "./types";
import type { PhotoItem } from "./types";

interface Notify { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }

export function PhotoGrid({ photos, onOpen, selected, showCustomer }: { photos: PhotoItem[]; onOpen: (p: PhotoItem) => void; selected?: number[]; showCustomer?: boolean }) {
  return (
    <div className="g2-grid">
      {photos.map((p) => (
        <button key={p.id} type="button" className={`g2-photo ${selected?.includes(p.id) ? "is-sel" : ""}`} onClick={() => onOpen(p)} aria-label={`Foto ${PHOTO_KIND_LABEL[p.kind] || ""} del ${dateTime(p.taken_at)}`}>
          <ProtectedImg path={`/photos/${p.id}/thumb`} alt={p.caption || `Foto ${PHOTO_KIND_LABEL[p.kind] || ""}`} />
          <div className="g2-photo-meta">
            <span><strong>{PHOTO_KIND_LABEL[p.kind] || p.kind}</strong>{p.is_public_now && <> · <Pill tone="green">Publicada</Pill></>}</span>
            <small>{showCustomer && p.customer_name ? `${p.customer_name} · ` : ""}{dateTime(p.taken_at)}</small>
          </div>
        </button>))}
    </div>
  );
}

/** Detalle de una foto: ampliar, cambiar tipo y leyenda, emparejar, publicar en el portfolio o borrar */
export function PhotoDetail({ photo, siblings, canPublish, notify, onClose, onChanged, onCompare }: {
  photo: PhotoItem; siblings: PhotoItem[]; canPublish: boolean; notify: Notify; onClose: () => void; onChanged: () => void; onCompare: (before: PhotoItem, after: PhotoItem) => void;
}) {
  const [kind, setKind] = useState(photo.kind);
  const [caption, setCaption] = useState(photo.caption || "");
  const [pair, setPair] = useState<number | "">(photo.pair_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [del, setDel] = useState(false);
  const url = useBlobUrl(`/photos/${photo.id}`);
  const others = siblings.filter((s) => s.id !== photo.id && s.customer_id === photo.customer_id);
  const paired = others.find((s) => s.id === photo.pair_id) || null;

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    const body: Record<string, unknown> = { kind, caption, ...extra };
    if (!("clear_pair" in extra) && pair !== "" && pair !== photo.pair_id) body.pair_id = pair;
    try { await appApi(`/photos/${photo.id}`, { method: "PUT", body }); notify.show("Foto actualizada"); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); }
  }
  async function remove() {
    try { await appApi(`/photos/${photo.id}`, { method: "DELETE" }); notify.show("Foto borrada"); onChanged(); } catch (e) { notify.fail(e); }
  }
  return (
    <Modal eyebrow="FOTO" title={`${PHOTO_KIND_LABEL[photo.kind] || "Foto"} · ${dateTime(photo.taken_at)}`} size="xl" onClose={onClose}
      footer={<><button className="tn-link tn-link-danger" onClick={() => setDel(true)}>Borrar</button><button className="secondary-button" onClick={onClose}>Cerrar</button><button className="primary-button" disabled={busy} onClick={() => save()}>{busy ? "Guardando..." : "Guardar"}</button></>}>
      <div className="tn-stack">
        {error && <div className="tn-note tn-note-error" role="alert">{error}</div>}
        {url ? <img src={url} alt={photo.caption || "Foto del cliente"} style={{ width: "100%", maxHeight: "60vh", objectFit: "contain", borderRadius: 12, background: "var(--tn-surface-2)" }} /> : <div className="g2-photo-empty">Cargando imagen…</div>}
        <div className="g2-form-grid">
          <Field label="Tipo"><select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(PHOTO_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Leyenda"><input value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} /></Field>
          <Field label="Par antes/después" hint="Otra foto del mismo cliente">
            <select value={pair} onChange={(e) => setPair(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Sin par</option>{others.map((o) => <option key={o.id} value={o.id}>{PHOTO_KIND_LABEL[o.kind]} · {dateTime(o.taken_at)}</option>)}</select></Field>
        </div>
        <div className="tn-row">
          {paired && <button className="secondary-button" onClick={() => (photo.kind === "DESPUES" ? onCompare(paired, photo) : onCompare(photo, paired))}>Comparar con su par</button>}
          {photo.pair_id && <button className="secondary-button" disabled={busy} onClick={() => save({ clear_pair: true })}>Quitar el par</button>}
        </div>
        {canPublish && (
          <div className={`g2-banner ${photo.is_public_now ? "is-ok" : "is-info"}`}><span aria-hidden="true">{photo.is_public_now ? "✓" : "i"}</span>
            <div>
              <strong>{photo.is_public_now ? "Esta foto se muestra en la vitrina del local" : "Esta foto no se muestra en la vitrina"}</strong>
              <span style={{ color: "var(--tn-ink)", fontSize: 13.5 }}>Solo se publica con el consentimiento «Fotos para portfolio y redes» firmado. Si el cliente lo revoca, sale de la vitrina en el acto.</span>
              <div style={{ marginTop: 8 }}><button className="secondary-button" disabled={busy} onClick={() => save({ public_visible: !photo.public_visible })}>{photo.public_visible ? "Sacar de la vitrina" : "Publicar en la vitrina"}</button></div>
            </div>
          </div>)}
      </div>
      {del && <ConfirmModal title="Borrar la foto" confirmLabel="Borrar" onConfirm={remove} onClose={() => setDel(false)}>La foto se borra del sistema y no se puede recuperar.</ConfirmModal>}
    </Modal>
  );
}

/** Comparador con control deslizante */
export function CompareModal({ before, after, onClose }: { before: PhotoItem; after: PhotoItem; onClose: () => void }) {
  const [pos, setPos] = useState(50);
  const a = useBlobUrl(`/photos/${before.id}`);
  const b = useBlobUrl(`/photos/${after.id}`);
  return (
    <Modal eyebrow="COMPARADOR" title="Antes y después" size="xl" onClose={onClose}>
      <div className="g2-compare" role="img" aria-label="Comparación de la foto de antes y la de después">
        {a && <img src={a} alt="Antes" />}
        <div className="g2-compare-top" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>{b && <img src={b} alt="Después" />}</div>
        <div className="g2-compare-bar" style={{ left: `${pos}%` }} />
        <span className="g2-compare-tag" style={{ left: 8 }}>Antes</span>
        <span className="g2-compare-tag" style={{ right: 8 }}>Después</span>
      </div>
      <input className="g2-range" type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Deslizá para comparar" />
    </Modal>
  );
}
