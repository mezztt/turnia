// Fotos de un cliente: consentimiento por finalidad, subida, galería, par antes/después y comparador.
import { useEffect, useRef, useState } from "react";
import { appApi, appUpload, getSessionUser } from "../../config";
import { Empty, Loading, Modal } from "../ui";
import { ConsentSignForm, useAppointments, useConsentTemplates } from "../fichas/ConsentForms";
import { prepareImage } from "../fichas/shared";
import type { Ficha } from "../fichas/shared";
import { CompareModal, PhotoDetail, PhotoGrid } from "./PhotoViews";
import { PHOTO_KIND_LABEL } from "./types";
import type { PhotoConsentStatus, PhotoItem } from "./types";

interface Notify { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }

export default function FotosCliente({ customer, notify }: { customer: Ficha["customer"]; notify: Notify }) {
  const cid = customer.id;
  const user = getSessionUser();
  const [photos, setPhotos] = useState<PhotoItem[] | null>(null);
  const [status, setStatus] = useState<PhotoConsentStatus | null>(null);
  const [open, setOpen] = useState<PhotoItem | null>(null);
  const [cmp, setCmp] = useState<[PhotoItem, PhotoItem] | null>(null);
  const [signing, setSigning] = useState(false);
  const [kind, setKind] = useState("ANTES");
  const [apptId, setApptId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const tpls = useConsentTemplates();
  const appts = useAppointments(cid);

  const load = () => {
    appApi<PhotoItem[]>(`/customers/${cid}/photos`).then(setPhotos).catch(notify.fail);
    appApi<PhotoConsentStatus>(`/customers/${cid}/photo-consent`).then(setStatus).catch(notify.fail);
  };
  useEffect(() => { setPhotos(null); load(); }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const { full, thumb } = await prepareImage(f);
        const form = new FormData();
        form.append("file", full, "foto.jpg");
        if (thumb) form.append("thumb", thumb, "mini.jpg");
        form.append("kind", kind);
        if (apptId !== "") form.append("appointment_id", String(apptId));
        await appUpload(`/customers/${cid}/photos`, form);
      }
      notify.show(files.length > 1 ? "Fotos guardadas" : "Foto guardada");
      load();
    } catch (e) { notify.fail(e); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  if (!photos || !status) return <Loading />;
  const tattoo = !!user?.tattoo_mode;
  return (
    <div className="tn-stack">
      {!status.internal.ok ? (
        <div className="g2-banner is-warn" role="alert"><span aria-hidden="true">!</span>
          <div><strong>{status.is_minor ? "Es menor: el padre, madre o tutor tiene que firmar el consentimiento de fotos" : "Falta el consentimiento de fotos para la ficha"}</strong>
            <span style={{ color: "var(--tn-ink)", fontSize: 13.5 }}>Sin consentimiento firmado no se guardan fotos.</span>
            <div style={{ marginTop: 8 }}><button className="primary-button" onClick={() => setSigning(true)}>Firmar consentimiento</button></div></div></div>
      ) : (
        <div className={`g2-banner ${status.public.ok ? "is-ok" : "is-info"}`}><span aria-hidden="true">{status.public.ok ? "✓" : "i"}</span>
          <div><strong>{status.public.ok ? "Autorizó fotos para portfolio y redes" : "Fotos solo para la ficha: sin consentimiento de portfolio esta foto no se publica"}</strong>
            {!status.public.ok && <div style={{ marginTop: 8 }}><button className="secondary-button" onClick={() => setSigning(true)}>Firmar portfolio y redes</button></div>}</div></div>)}
      {status.policy_text && <small className="tn-hint">{status.policy_text}</small>}

      <div className="tn-card">
        <div className="g2-head"><div><h2>Fotos</h2><small>Se reducen automáticamente antes de subirlas.</small></div></div>
        <div className="g2-period">
          <div className="form-group"><label htmlFor="fk">Tipo</label><select id="fk" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(PHOTO_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          {appts.length > 0 && <div className="form-group"><label htmlFor="fa">Turno</label><select id="fa" value={apptId} onChange={(e) => setApptId(e.target.value ? Number(e.target.value) : "")}><option value="">Sin turno</option>
            {appts.map((a) => <option key={a.id} value={a.id}>{a.date.slice(0, 10)} · {a.services.join(", ") || "Turno"}</option>)}</select></div>}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => pick(e.target.files)} />
          <button className="primary-button" disabled={!status.internal.ok || busy} onClick={() => input.current?.click()}>{busy ? "Subiendo..." : "Subir o sacar foto"}</button>
        </div>
        {!photos.length ? <Empty title="Todavía no hay fotos">Las fotos de antes y después aparecen acá.</Empty> : <PhotoGrid photos={photos} onOpen={setOpen} />}
      </div>

      {open && <PhotoDetail photo={open} siblings={photos} canPublish={status.public.ok || open.public_visible} notify={notify} onClose={() => setOpen(null)}
        onChanged={() => { setOpen(null); load(); }} onCompare={(a, b) => { setOpen(null); setCmp([a, b]); }} />}
      {cmp && <CompareModal before={cmp[0]} after={cmp[1]} onClose={() => setCmp(null)} />}
      {signing && tpls && (
        <Modal eyebrow="FIRMAR" title="Consentimiento de fotos" size="xl" onClose={() => setSigning(false)}>
          <ConsentSignForm customer={customer} tattoo={tattoo} templates={tpls} kinds={["FOTOS_INTERNAS", "FOTOS_PUBLICAS"]} appointments={appts} notify={notify} big
            onCancel={() => setSigning(false)} onDone={() => { setSigning(false); load(); }} />
        </Modal>)}
    </div>
  );
}
