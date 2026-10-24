// Impresión desde el navegador (sin agente de impresión): comprobante interno de 80 mm con CSS @page.
// Todo lo que sale de acá lleva «Documento no válido como factura».
export const NOT_INVOICE = "Documento no válido como factura";

export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** Imprime un HTML en un marco oculto. `width`: ancho del papel. */
export function printHtml(title: string, bodyHtml: string, width = "80mm") {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) { frame.remove(); return; }
  doc.open();
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: ${width} auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { margin: 0; width: ${width === "80mm" ? "72mm" : "auto"}; font: 12px/1.4 "Courier New", monospace; color: #000; background: #fff; }
    h1 { font-size: 15px; margin: 0 0 2px; text-align: center; }
    .c { text-align: center; } .r { text-align: right; } .b { font-weight: 700; }
    .sep { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .big { font-size: 15px; font-weight: 700; }
    .warn { border: 1px solid #000; padding: 3px 5px; margin: 4px 0; font-weight: 700; }
    .legal { text-align: center; font-size: 11px; margin-top: 8px; }
  </style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  win.onafterprint = () => window.setTimeout(() => frame.remove(), 300);
  window.setTimeout(() => { win.focus(); win.print(); window.setTimeout(() => frame.remove(), 60000); }, 150);
}
