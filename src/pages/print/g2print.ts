// Hojas A4 del grupo G2 (consentimiento firmado con original y copia, libro de bioseguridad). Se imprimen desde el navegador.
// Todo lo que sale de acá lleva «Documento no válido como factura».
import { esc, NOT_INVOICE } from "./printDoc";

function printA4(title: string, bodyHtml: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) { frame.remove(); return; }
  doc.open();
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 12.5px/1.5 Arial, Helvetica, sans-serif; color: #000; background: #fff; }
    h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 16px 0 6px; } h3 { font-size: 13px; margin: 0 0 4px; }
    .head { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
    .num { font-size: 20px; font-weight: 700; text-align: right; }
    .box { border: 1px solid #000; padding: 8px 10px; margin: 8px 0; }
    .body { white-space: pre-wrap; border: 1px solid #000; padding: 10px 12px; margin: 10px 0; }
    .sig { display: flex; gap: 24px; margin-top: 14px; align-items: flex-end; }
    .sig div { flex: 1; border-top: 1px solid #000; padding-top: 4px; font-size: 11.5px; }
    .sig img { max-height: 90px; display: block; margin-bottom: 4px; }
    .tag { display: inline-block; border: 1px solid #000; padding: 1px 8px; font-weight: 700; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; font-size: 11.5px; }
    th, td { border: 1px solid #000; padding: 3px 6px; text-align: left; vertical-align: top; }
    th { background: #eee; }
    .legal { margin-top: 12px; font-size: 11px; text-align: center; }
    .page { page-break-after: always; } .page:last-child { page-break-after: auto; }
  </style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  win.onafterprint = () => window.setTimeout(() => frame.remove(), 300);
  window.setTimeout(() => { win.focus(); win.print(); window.setTimeout(() => frame.remove(), 60000); }, 200);
}

const fmtDate = (v: string | null | undefined) => (v ? new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString("es-AR") : "—");
const fmtDateTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "—");

export interface ConsentPrintData {
  title: string; number: number | null; version: number; body: string; signed_at: string; signer_name: string; signer_dni_text: string | null;
  signer_is_guardian: boolean; guardian_relation: string | null; signature: string | null; official_form_number: string | null; locked_until: string | null; revoked_at: string | null;
  customer: { name: string; dni_text: string | null; birthday: string | null; phone: string | null; address: string | null };
  venue: { name: string | null; address: string | null; phone: string | null; cuit_text: string | null; footer: string | null };
  tattoo_mode: boolean;
}

/** Original para el local y copia para el cliente, cada una en su hoja */
export function printConsent(d: ConsentPrintData) {
  const page = (label: string) => `<div class="page">
    <div class="head"><div><h1>${esc(d.venue.name || "Consentimiento informado")}</h1>
      <div>${esc([d.venue.address, d.venue.phone].filter(Boolean).join(" · "))}${d.venue.cuit_text ? ` · CUIT ${esc(d.venue.cuit_text)}` : ""}</div></div>
      <div><div class="num">${d.number ? `N.º ${String(d.number).padStart(5, "0")}` : ""}</div><span class="tag">${esc(label)}</span></div></div>
    <h2>${esc(d.title)}</h2>
    <div class="box"><b>Cliente:</b> ${esc(d.customer.name)} · <b>DNI:</b> ${esc(d.customer.dni_text || "—")} · <b>Nacimiento:</b> ${fmtDate(d.customer.birthday)}<br>
      <b>Teléfono:</b> ${esc(d.customer.phone || "—")} · <b>Domicilio:</b> ${esc(d.customer.address || "—")}</div>
    <div class="body">${esc(d.body)}</div>
    ${d.official_form_number ? `<div class="box">Firmado en el formulario oficial del Ministerio de Salud N.º <b>${esc(d.official_form_number)}</b>.</div>` : ""}
    <div class="sig"><div>${d.signature ? `<img src="${d.signature}" alt="Firma">` : "<br><br>"}Firma de ${d.signer_is_guardian ? `${esc(d.guardian_relation || "tutor")} (padre, madre o tutor)` : "el cliente"}: ${esc(d.signer_name)}${d.signer_dni_text ? ` · DNI ${esc(d.signer_dni_text)}` : ""}</div>
      <div><br><br>Aclaración y firma del profesional</div></div>
    <p>Firmado el ${fmtDateTime(d.signed_at)} · texto versión ${d.version}.${d.locked_until ? ` Se conserva hasta el ${fmtDate(d.locked_until)} (Ley 7434 y Decreto 56/07, Mendoza).` : ""}${d.revoked_at ? ` REVOCADO el ${fmtDate(d.revoked_at)}.` : ""}</p>
    <div class="legal">${esc(d.venue.footer || "")} ${d.venue.footer ? "· " : ""}${NOT_INVOICE}.</div></div>`;
  printA4(`Consentimiento ${d.number ?? ""} ${d.customer.name}`, page("ORIGINAL · para el local") + page("COPIA · para el cliente"));
}

export interface BookData {
  from: string; to: string; generated: string;
  venue: { name: string | null; address: string | null; phone: string | null; cuit_text: string | null };
  cycles: { date_time: string; equipment_name: string | null; method: string; load_description: string | null; indicator_result: string; lot_code: string | null; operator_name: string | null; notes: string | null }[];
  lots: { kind: string; name: string; brand: string | null; lot_code: string | null; expires_on: string | null; qty_in: number; qty_left: number; status: string }[];
  cleaning: { date: string; template_name: string; done: number; total: number; done_by_name: string | null }[];
  waste: { date: string; operator_name: string | null; manifest_number: string | null; weight_text: string | null; notes: string | null }[];
  documents: { name: string; number: string | null; expires_on: string | null }[];
}
const IND: Record<string, string> = { CONFORME: "Conforme", NO_CONFORME: "NO CONFORME", SIN_INDICADOR: "Sin indicador" };
const STATUS: Record<string, string> = { VIGENTE: "Vigente", VENCIDO: "VENCIDO", POR_VENCER: "Por vencer", AGOTADO: "Agotado", SIN_FECHA: "Sin fecha" };

export function printBook(d: BookData) {
  const rows = (items: string[][]) => items.length ? items.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="9">Sin registros en el período.</td></tr>`;
  const html = `<div class="head"><div><h1>Libro de bioseguridad</h1><div>${esc(d.venue.name || "")} · ${esc([d.venue.address, d.venue.phone].filter(Boolean).join(" · "))}</div></div>
    <div style="text-align:right">Período: ${fmtDate(d.from)} al ${fmtDate(d.to)}<br>Emitido ${fmtDateTime(d.generated)}</div></div>
    <p class="box">Turnia registra lo que el local declara. No certifica la esterilización ni reemplaza el Manual de Procedimientos del Ministerio de Salud.</p>
    <h2>Ciclos de esterilización</h2><table><tr><th>Fecha</th><th>Lote del ciclo</th><th>Equipo</th><th>Método</th><th>Carga</th><th>Indicador</th><th>Responsable</th></tr>
    ${rows(d.cycles.map((c) => [fmtDateTime(c.date_time), c.lot_code || "", c.equipment_name || "", c.method, c.load_description || "", IND[c.indicator_result] || c.indicator_result, c.operator_name || ""]))}</table>
    <h2>Lotes de material</h2><table><tr><th>Tipo</th><th>Material</th><th>Marca</th><th>Lote</th><th>Vence</th><th>Ingresó</th><th>Queda</th><th>Estado</th></tr>
    ${rows(d.lots.map((l) => [l.kind, l.name, l.brand || "", l.lot_code || "", fmtDate(l.expires_on), String(l.qty_in), String(l.qty_left), STATUS[l.status] || l.status]))}</table>
    <h2>Limpieza</h2><table><tr><th>Día</th><th>Lista</th><th>Ítems hechos</th><th>Registró</th></tr>
    ${rows(d.cleaning.map((l) => [fmtDate(l.date), l.template_name, `${l.done} de ${l.total}`, l.done_by_name || ""]))}</table>
    <h2>Retiro de residuos patogénicos</h2><table><tr><th>Fecha</th><th>Operador</th><th>Manifiesto</th><th>Peso</th><th>Notas</th></tr>
    ${rows(d.waste.map((w) => [fmtDate(w.date), w.operator_name || "", w.manifest_number || "", w.weight_text || "", w.notes || ""]))}</table>
    <h2>Documentos del local</h2><table><tr><th>Documento</th><th>Número</th><th>Vence</th></tr>
    ${rows(d.documents.map((x) => [x.name, x.number || "", fmtDate(x.expires_on)]))}</table>
    <div class="legal">${NOT_INVOICE}.</div>`;
  printA4("Libro de bioseguridad", html);
}
