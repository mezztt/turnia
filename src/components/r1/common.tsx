// Piezas compartidas de las pantallas de gestión: cantidades con unidad, confirmaciones, estados vacíos.
import { useState } from "react";
import "../../r1.css";
import type { ReactNode } from "react";
import { money } from "../../config";
import { Modal } from "../ui";

/** 1234.5 -> "1.234,5" */
export function fmtNum(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

/** Pesos con centavos solo si hacen falta, y 4 decimales chicos para costos por gramo (0,0012) */
export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Math.abs(n) > 0 && Math.abs(n) < 1 ? (n < 0 ? "-$" : "$") + fmtNum(Math.abs(n), 4) : money(n);
}

const SUB: Record<string, { unit: string; factor: number }> = { kg: { unit: "g", factor: 1000 }, l: { unit: "ml", factor: 1000 } };

/** 0.25 kg -> "250 g" · 1.5 kg -> "1,5 kg" · 12 u -> "12 u" */
export function fmtQty(qty: number | null | undefined, unit: string): string {
  if (qty === null || qty === undefined) return "—";
  const sub = SUB[unit];
  if (sub && Math.abs(qty) > 0 && Math.abs(qty) < 1) return `${fmtNum(qty * sub.factor, 1)} ${sub.unit}`;
  return `${fmtNum(qty, 3)} ${unit}`;
}

/**
 * Cantidad con unidad: se guarda siempre en la unidad del insumo (kg, l, u…) pero se puede escribir en la unidad chica
 * (g, ml). value = número en la unidad base; onChange devuelve el número en la unidad base.
 */
export function QtyInput({ value, unit, onChange, ariaLabel, autoFocus }: {
  value: number | null; unit: string; onChange: (v: number | null) => void; ariaLabel?: string; autoFocus?: boolean;
}) {
  const sub = SUB[unit];
  const [useSub, setUseSub] = useState(() => !!sub && value !== null && value > 0 && value < 1);
  const factor = sub && useSub ? sub.factor : 1;
  const shown = value === null ? "" : String(Math.round(value * factor * 10000) / 10000).replace(".", ",");
  const [text, setText] = useState(shown);
  function commit(t: string, f: number) {
    setText(t);
    const n = t.trim() === "" ? null : Number(t.replace(",", "."));
    onChange(n === null || !Number.isFinite(n) ? null : n / f);
  }
  return (
    <span className="tn-qty">
      <input inputMode="decimal" aria-label={ariaLabel || "Cantidad"} value={text} autoFocus={autoFocus} onChange={(e) => commit(e.target.value, factor)} />
      {sub ? (
        <select aria-label="Unidad" value={useSub ? sub.unit : unit}
          onChange={(e) => {
            const toSub = e.target.value === sub.unit;
            const f = toSub ? sub.factor : 1;
            setUseSub(toSub);
            const base = text.trim() === "" ? null : Number(text.replace(",", ".")) / factor;
            setText(base === null || !Number.isFinite(base) ? "" : String(Math.round(base * f * 10000) / 10000).replace(".", ","));
          }}>
          <option value={unit}>{unit}</option><option value={sub.unit}>{sub.unit}</option>
        </select>
      ) : <span className="tn-qty-unit">{unit}</span>}
    </span>
  );
}

/** Confirmación con ventana propia (reemplaza a window.confirm) */
export function ConfirmModal({ title, children, confirmLabel, danger, busy, onConfirm, onClose }: {
  title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal eyebrow="CONFIRMAR" title={title} onClose={onClose}
      footer={<><button className="secondary-button" onClick={onClose}>Volver</button>
        <button className={danger ? "tn-danger-button" : "primary-button"} onClick={onConfirm} disabled={busy}>{busy ? "Un momento..." : confirmLabel}</button></>}>
      <div className="tn-muted" style={{ fontSize: 14 }}>{children}</div>
    </Modal>
  );
}

/** Estado vacío con una acción */
export function EmptyAction({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="tn-empty">
      <strong>{title}</strong>
      {text}
      {action && onAction && <div style={{ marginTop: 12 }}><button className="primary-button" onClick={onAction}>{action}</button></div>}
    </div>
  );
}

export interface Opt { id: number; name: string }
