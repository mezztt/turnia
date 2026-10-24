// Impresiones del grupo G3: ticket de venta (80 mm), liquidación de comisiones y lista de conteo de stock (A4).
// Todo lo que sale de acá lleva «Documento no válido como factura» (las comisiones, además, «ni recibo de sueldo»).
import { money } from "../../config";
import { esc, NOT_INVOICE, printHtml } from "./printDoc";

const dmy = (v: string | null | undefined) => (v ? new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString("es-AR") : "—");
const dmyhm = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "—");
const METHODS: Record<string, string> = {
  EFECTIVO: "Efectivo", DEBITO: "Débito", CREDITO: "Crédito", TRANSFERENCIA: "Transferencia", MERCADOPAGO: "Mercado Pago", QR: "QR",
  SALDO_A_FAVOR: "Saldo a favor", PACK: "Pack", OTRO: "Otro",
};

export interface TicketData {
  legal: string; local: string; address?: string | null; phone?: string | null; cuit_text?: string | null; footer?: string | null;
  number: number; status: string; date: string; seller?: string | null; customer?: string | null;
  items: { name: string; qty: number; unit_price: number; discount: number; total: number; professional_name?: string | null; paid_with_pack?: boolean }[];
  discounts: { reason: string | null; amount: number }[];
  subtotal: number; discount_total: number; total: number; tip_total: number;
  payments: { method: string; amount: number; tip_amount: number; status: string }[];
  deposit_applied: number; fiscal_ref?: string | null; void_reason?: string | null;
}

export function printSaleTicket(t: TicketData) {
  const rows = t.items.map((i) => `<div class="row"><span>${esc(i.qty !== 1 ? `${i.qty} x ` : "")}${esc(i.name)}</span><span>${i.paid_with_pack ? "pack" : esc(money(i.total + i.discount))}</span></div>` +
    (i.professional_name ? `<div style="font-size:10.5px">  con ${esc(i.professional_name)}</div>` : "")).join("");
  const disc = t.discounts.filter((d) => d.amount > 0).map((d) => `<div class="row"><span>Desc. ${esc(d.reason || "")}</span><span>-${esc(money(d.amount))}</span></div>`).join("");
  const pays = t.payments.map((p) => `<div class="row"><span>${esc(METHODS[p.method] || p.method)}${p.status === "DEVUELTO" ? " (devuelto)" : ""}</span><span>${esc(money(p.amount))}</span></div>` +
    (p.tip_amount > 0 ? `<div class="row"><span>  Propina</span><span>${esc(money(p.tip_amount))}</span></div>` : "")).join("");
  printHtml(`Ticket ${t.number}`, `
    <h1>${esc(t.local)}</h1>
    <div class="c">${esc([t.address, t.phone].filter(Boolean).join(" · "))}${t.cuit_text ? `<br>${esc(t.cuit_text)}` : ""}</div>
    <div class="sep"></div>
    <div class="row"><span>Venta N.º ${t.number}</span><span>${esc(dmyhm(t.date))}</span></div>
    ${t.customer ? `<div>Cliente: ${esc(t.customer)}</div>` : ""}${t.seller ? `<div>Atendió: ${esc(t.seller)}</div>` : ""}
    ${t.status === "ANULADA" ? `<div class="warn c">VENTA ANULADA${t.void_reason ? ` · ${esc(t.void_reason)}` : ""}</div>` : ""}
    <div class="sep"></div>${rows}<div class="sep"></div>
    <div class="row"><span>Subtotal</span><span>${esc(money(t.subtotal))}</span></div>${disc}
    <div class="row big"><span>TOTAL</span><span>${esc(money(t.total))}</span></div>
    ${t.deposit_applied > 0 ? `<div class="row"><span>Seña ya pagada</span><span>${esc(money(t.deposit_applied))}</span></div>` : ""}
    <div class="sep"></div>${pays}
    ${t.tip_total > 0 ? `<div class="row b"><span>Propina total</span><span>${esc(money(t.tip_total))}</span></div>` : ""}
    ${t.fiscal_ref ? `<div class="sep"></div><div>Comprobante emitido aparte: ${esc(t.fiscal_ref)}</div>` : ""}
    ${t.footer ? `<div class="c" style="margin-top:6px">${esc(t.footer)}</div>` : ""}
    <div class="legal b">${esc(NOT_INVOICE)}</div>`);
}

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
    @page { size: A4; margin: 14mm; } * { box-sizing: border-box; }
    body { margin: 0; font: 12.5px/1.5 Arial, Helvetica, sans-serif; color: #000; background: #fff; }
    h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 14px 0 6px; }
    .head { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
    .box { border: 1px solid #000; padding: 8px 10px; margin: 8px 0; } .r { text-align: right; } .b { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; font-size: 11.5px; }
    th, td { border: 1px solid #000; padding: 3px 6px; text-align: left; vertical-align: top; } th { background: #eee; } td.r, th.r { text-align: right; }
    .sig { display: flex; gap: 40px; margin-top: 50px; } .sig div { flex: 1; border-top: 1px solid #000; padding-top: 4px; font-size: 11.5px; }
    .legal { margin-top: 14px; font-size: 11px; text-align: center; font-weight: 700; }
  </style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  win.onafterprint = () => window.setTimeout(() => frame.remove(), 300);
  window.setTimeout(() => { win.focus(); win.print(); window.setTimeout(() => frame.remove(), 60000); }, 200);
}

export interface SettlementPrint {
  id: number; local: string; legal: string; note: string; professional_name: string; from_date: string; to_date: string; status: string;
  commission_total: number; tips_total: number; advances?: number; discounts?: number; bonus?: number; adjustments_total: number; total_to_pay: number;
  paid_at: string | null; notes?: string | null;
  lines: { date: string; sale_number: number | null; item: string; kind: string; base: number; rate: number; amount: number }[];
  adjustments: { date: string; kind: string; amount: number; reason: string | null }[];
}

export function printSettlement(s: SettlementPrint) {
  const lines = s.lines.map((l) => `<tr><td>${esc(dmy(l.date))}</td><td>${l.sale_number ? "#" + l.sale_number : ""}</td><td>${esc(l.item)}</td>
    <td class="r">${l.kind === "PROP" ? "" : esc(money(l.base))}</td><td class="r">${l.kind === "PROP" ? "" : l.kind === "FIJO" ? "fijo" : esc(l.rate + "%")}</td><td class="r">${esc(money(l.amount))}</td></tr>`).join("");
  const adjs = s.adjustments.map((a) => `<tr><td>${esc(dmy(a.date))}</td><td>${esc(a.kind === "ADELANTO" ? "Adelanto" : a.kind === "BONO" ? "Bono" : "Descuento")}</td><td>${esc(a.reason || "")}</td>
    <td class="r">${a.kind === "BONO" ? "" : "-"}${esc(money(a.amount))}</td></tr>`).join("");
  printA4(`Liquidación ${s.professional_name}`, `
    <div class="head"><div><h1>Liquidación de comisiones</h1><div>${esc(s.local)}</div></div><div class="r"><div class="b">${esc(s.professional_name)}</div><div>Del ${esc(dmy(s.from_date))} al ${esc(dmy(s.to_date))}</div><div>${s.status === "PAGADA" ? "Pagada el " + esc(dmy(s.paid_at)) : s.status === "CERRADA" ? "Cerrada, pendiente de pago" : "Vista previa"}</div></div></div>
    <table><thead><tr><th>Fecha</th><th>Venta</th><th>Detalle</th><th class="r">Base</th><th class="r">%</th><th class="r">Comisión</th></tr></thead><tbody>${lines || '<tr><td colspan="6">Sin comisiones en el período</td></tr>'}</tbody></table>
    ${adjs ? `<h2>Adelantos, descuentos y bonos</h2><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th class="r">Importe</th></tr></thead><tbody>${adjs}</tbody></table>` : ""}
    <div class="box"><div>Comisiones: <b>${esc(money(s.commission_total))}</b></div><div>Propinas: <b>${esc(money(s.tips_total))}</b></div>
    <div>Adelantos, descuentos y bonos: <b>${esc(money(s.adjustments_total))}</b></div><div style="font-size:15px;margin-top:4px">A pagar: <b>${esc(money(s.total_to_pay))}</b></div></div>
    ${s.notes ? `<div>Notas: ${esc(s.notes)}</div>` : ""}
    <div>${esc(s.note)}</div>
    <div class="sig"><div>Firma de quien liquida</div><div>Firma del profesional</div></div>
    <div class="legal">${esc(s.legal)}</div>`);
}

export function printCountSheet(local: string, rows: { name: string; brand?: string | null; unit: string; stock_qty: number }[]) {
  const body = rows.map((r) => `<tr><td>${esc(r.name)}${r.brand ? " · " + esc(r.brand) : ""}</td><td class="r">${esc(String(r.stock_qty).replace(".", ","))} ${esc(r.unit)}</td><td style="width:90px"></td></tr>`).join("");
  printA4("Conteo de stock", `<div class="head"><div><h1>Conteo de stock</h1><div>${esc(local)}</div></div><div class="r">${esc(dmy(new Date().toISOString().slice(0, 10)))}</div></div>
    <table><thead><tr><th>Producto</th><th class="r">En sistema</th><th>Contado</th></tr></thead><tbody>${body}</tbody></table>
    <div class="legal">${esc(NOT_INVOICE)} · Planilla interna de control</div>`);
}
