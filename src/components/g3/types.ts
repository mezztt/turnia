// Tipos de lo que devuelve el backend de G3 (ventas, caja, productos, comisiones, packs)
export interface SaleItemT {
  id: number; kind: "SERVICIO" | "PRODUCTO" | "PACK" | "MEMBRESIA" | "AJUSTE"; name: string; qty: number; unit_price: number; discount: number; total: number;
  professional_id: number | null; professional_name: string | null; paid_with_pack: boolean; client_pack_id: number | null; membership_id: number | null;
  service_id: number | null; product_id: number | null; pack_template_id: number | null; plan_id: number | null; appointment_item_id: number | null;
}
export interface PackOpt { id: number; name: string; left: number; total: number; expires_on: string | null; unit_value: number }
export interface MemOpt { id: number; name: string; left: number | null }
export interface SaleT {
  id: number; number: number; status: "ABIERTA" | "COBRADA" | "ANULADA"; appointment_id: number | null; shift_id: number | null;
  customer: { id: number; name: string; phone: string | null; phone_wa: string | null; credit_balance: number; is_minor: boolean } | null;
  items: SaleItemT[];
  discounts: { id: number; sale_item_id: number | null; kind: string; value: number; amount: number; reason: string | null }[];
  subtotal: number; discount_total: number; tip_total: number; total: number; paid_total: number; deposit_available: number; deposit_applied: number;
  payments: { id: number; method: string; purpose: string; amount: number; tip_amount: number; reference: string | null; status: string; created_at: string }[];
  notes: string | null; void_reason: string | null; fiscal_ref: string | null; created_at: string; paid_at: string | null;
  pack_options: Record<string, PackOpt[]>; membership_options: Record<string, MemOpt[]>;
  change?: number; warnings?: string[];
}
export interface ShiftT {
  id: number; status: "ABIERTO" | "CERRADO"; opened_at: string; closed_at: string | null; opened_by: string | null; closed_by: string | null;
  opening_float: number; notes: string | null; sales_count: number; sales_total: number; tips_total: number;
  by_method: Record<string, number>; tips_by_method: Record<string, number>; cash_in: number; ingresos: number; egresos: number; retiros: number;
  expected_cash: number | null; counted_cash: number | null; difference: number | null;
  movements: { id: number; kind: string; concept: string; amount: number; created_at: string }[];
}
export interface ShiftState { shift: ShiftT | null; stale: boolean; blind_cash_close: boolean; tip_enabled: boolean; tip_options: number[]; can_manage: boolean }
export interface ProLite { id: number; name: string; display_name?: string | null }
export const proName = (p: ProLite) => p.display_name || p.name;
