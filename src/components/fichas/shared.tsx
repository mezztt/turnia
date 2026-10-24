// Piezas compartidas de Fichas, Fotos y Bioseguridad (grupo G2): tipos, firma en pantalla, buscador de clientes, imágenes protegidas.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { appApi, appBlob } from "../../config";

export interface FieldDef { key: string; label: string; type: "texto" | "numero" | "opcion" | "check" | "fecha" | "zona"; required: boolean; options: string[] }
export interface RecTemplate { id: number; name: string; kind: "FICHA" | "FORMULA" | "TRABAJO" | "CUIDADOS"; rubro_tag: string | null; fields: FieldDef[]; active: boolean }
export interface ConsentTpl { id: number; kind: string; title: string; body: string; version: number; numbered: boolean; requires_guardian_if_under_age: number | null; active: boolean }
export interface Flag { id: number; kind: string; kind_label: string; text: string; severity: "INFO" | "ATENCION" | "GRAVE"; source: string; consent_at: string | null; active: boolean }
export interface Material { lot_id: number; name: string; kind: string | null; lot_code: string | null; expires_on: string | null; qty: number; cycle_id: number | null; cycle_code: string | null }
export interface RecordItem {
  id: number; customer_id: number; template_id: number | null; template_name: string; kind: string; appointment_id: number | null; professional_name: string | null;
  date: string; data: Record<string, any>; notes: string | null; locked: boolean; amends_id: number | null; amended_by_id: number | null; materials: Material[]; consent_number: number | null;
}
export interface ConsentItem {
  id: number; kind: string; template_id: number; title: string; number: number | null; signed_at: string; signer_name: string; signer_is_guardian: boolean;
  guardian_relation: string | null; appointment_id: number | null; official_form_number: string | null; has_scan: boolean; valid_until: string | null;
  revoked_at: string | null; locked_until: string | null; valid: boolean; signed_on_paper: boolean;
}
export interface Ficha {
  customer: { id: number; name: string; phone: string | null; phone_wa: string | null; birthday: string | null; age: number | null; dni_text: string | null; is_minor: boolean; minor_limit: number;
    guardian_name: string | null; guardian_dni_text: string | null; guardian_phone: string | null; data_consent_at: string | null; anonymized: boolean };
  view: "full" | "alert"; tattoo_mode: boolean; laser_mode: boolean;
  alert: { has_alert: boolean; count: number; severity: string | null };
  health_declared: boolean; consent_status: Record<string, boolean>; photo_policy_text: string | null;
  flags?: Flag[]; last_formula?: RecordItem | null; patch?: { status: string; last_on: string | null; valid_until: string | null; days: number };
  counts?: { records: number; consents: number; patch_tests: number; flags: number };
}
export interface CustomerLite { id: number; name: string; phone: string | null; health_alert: boolean }

export const SEVERITY_TONE: Record<string, string> = { INFO: "gray", ATENCION: "orange", GRAVE: "red" };
export const SEVERITY_LABEL: Record<string, string> = { INFO: "Informativo", ATENCION: "Atención", GRAVE: "Grave" };
export const PATCH_LABEL: Record<string, [string, string]> = {
  VIGENTE: ["Vigente", "green"], VENCIDO: ["Vencido", "orange"], SIN_TEST: ["Sin test", "gray"], POSITIVO: ["Positivo: no aplicar", "red"], SIN_LECTURA: ["Falta la lectura", "orange"],
};

/** Texto de un valor guardado en una ficha */
export function showValue(v: unknown): string {
  if (v === true) return "Sí";
  if (v === false || v === null || v === undefined || v === "") return "—";
  return String(v);
}

/** Pasa un archivo protegido (foto) a una URL local para <img>, con el token en el encabezado. */
export function useBlobUrl(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let alive = true;
    let made: string | null = null;
    appBlob(path).then((b) => { if (!alive) return; made = URL.createObjectURL(b); setUrl(made); }).catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [path]);
  return url;
}

/** Imagen protegida (miniatura o foto completa) */
export function ProtectedImg({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const url = useBlobUrl(path);
  if (!url) return <div className="g2-photo-empty" aria-label="Cargando imagen">…</div>;
  return <img src={url} alt={alt} className={className} />;
}

/** Firma con el dedo o el mouse. Avisa con el PNG (data URL) cada vez que termina un trazo, o null si se borra. */
export function SignaturePad({ onChange, big }: { onChange: (png: string | null) => void; big?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const reset = useCallback(() => {
    const cv = ref.current;
    if (!cv) return;
    const ratio = window.devicePixelRatio || 1;
    cv.width = Math.max(300, Math.round(cv.clientWidth * ratio));
    cv.height = Math.max(150, Math.round(cv.clientHeight * ratio));
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.lineWidth = 2.4 * ratio;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111";
    dirty.current = false;
  }, []);
  useEffect(() => { reset(); }, [reset]);

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const cv = ref.current as HTMLCanvasElement;
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * cv.width, y: ((e.clientY - r.top) / r.height) * cv.height };
  };
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    e.preventDefault();
    ref.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
    dirty.current = true;
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current && ref.current) onChange(ref.current.toDataURL("image/png"));
  };
  return (
    <div className={`g2-sig ${big ? "is-big" : ""}`}>
      <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Zona para firmar con el dedo o el mouse" />
      <div className="tn-row" style={{ justifyContent: "space-between" }}>
        <span className="tn-hint" style={{ margin: 0 }}>Firmá dentro del recuadro.</span>
        <button type="button" className="secondary-button g2-small-btn" onClick={() => { reset(); onChange(null); }}>Borrar firma</button>
      </div>
    </div>
  );
}

/** Buscador de clientes (nombre, teléfono o DNI). Trae los primeros al abrir. */
export function CustomerPicker({ onPick, placeholder }: { onPick: (c: CustomerLite) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CustomerLite[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => {
      const path = q.trim().length >= 2 ? `/customers/search?q=${encodeURIComponent(q.trim())}` : "/customers?limit=30";
      appApi<CustomerLite[]>(path).then((r) => { setRows(r); setError(""); }).catch((e) => setError(e.message));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);
  return (
    <div className="tn-stack">
      <input className="tn-search" style={{ width: "100%" }} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || "Buscar por nombre, teléfono o DNI"} aria-label="Buscar cliente" />
      {error && <div className="tn-note tn-note-error">{error}</div>}
      {rows && rows.length === 0 && <div className="tn-empty"><strong>No encontramos clientes</strong>Probá con otro nombre o cargalo en Clientes.</div>}
      {rows && rows.length > 0 && (
        <ul className="tn-list">
          {rows.map((c) => (
            <li key={c.id} className="is-click" onClick={() => onPick(c)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onPick(c); }}>
              <div className="tn-list-main"><strong>{c.name}</strong><small>{c.phone || "Sin teléfono"}</small></div>
              {c.health_alert && <span className="tn-pill tn-pill-red">Alerta de salud</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Reduce una foto a ≤ 1600 px, JPEG, hasta ~1,5 MB, y arma la miniatura */
export async function prepareImage(file: File): Promise<{ full: Blob; thumb: Blob | null }> {
  const bmp = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
  const draw = (max: number, quality: number) => new Promise<Blob | null>((resolve) => {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height, 1));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(bmp.width * scale));
    cv.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = cv.getContext("2d");
    if (!ctx) { resolve(null); return; }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    cv.toBlob((b) => resolve(b), "image/jpeg", quality);
  });
  let full: Blob | null = null;
  for (const q of [0.85, 0.75, 0.62, 0.5]) {
    full = await draw(1600, q);
    if (full && full.size <= 1.5 * 1024 * 1024) break;
  }
  if (!full) throw new Error("No se pudo preparar la foto");
  return { full, thumb: await draw(320, 0.72) };
}
