// Rubros de Turnia: etiquetas, vocabulario por defecto y módulos que el panel tilda al elegirlo.
// Mismos datos que backend/rubro_presets.py y backend/schemas.py (SUGGESTED_MODULES).
import type { Vocabulary } from "./config";

export const RUBROS = ["PELUQUERIA", "BARBERIA", "ESTETICA", "UNAS", "DEPILACION", "SPA", "TATUAJES", "COSMETOLOGIA"] as const;
export const RUBRO_LABELS: Record<string, string> = {
  PELUQUERIA: "Peluquería", BARBERIA: "Barbería", ESTETICA: "Centro de estética", UNAS: "Uñas",
  DEPILACION: "Depilación", SPA: "Spa y masajes", TATUAJES: "Tatuajes y piercing", COSMETOLOGIA: "Cosmetología",
};
export const SUGGESTED_MODULES: Record<string, string[]> = {
  PELUQUERIA: ["agenda", "caja", "productos", "comisiones"],
  BARBERIA: ["agenda", "caja"],
  ESTETICA: ["agenda", "fichas", "fotos", "caja", "packs", "recursos"],
  UNAS: ["agenda", "caja", "productos"],
  DEPILACION: ["agenda", "fichas", "caja", "packs", "recursos"],
  SPA: ["agenda", "caja", "packs", "recursos"],
  TATUAJES: ["agenda", "fichas", "fotos", "caja", "bioseguridad"],
  COSMETOLOGIA: ["agenda", "fichas", "fotos", "caja", "bioseguridad"],
};
const V = (profesional: string, profesionales: string, turno: string, turnos: string, puesto: string, puestos: string): Vocabulary => ({ profesional, profesionales, turno, turnos, puesto, puestos });
export const VOCABULARY: Record<string, Vocabulary> = {
  PELUQUERIA: V("estilista", "estilistas", "turno", "turnos", "sillón", "sillones"),
  BARBERIA: V("barbero", "barberos", "turno", "turnos", "sillón", "sillones"),
  ESTETICA: V("esteticista", "esteticistas", "sesión", "sesiones", "cabina", "cabinas"),
  UNAS: V("manicura", "manicuras", "turno", "turnos", "puesto", "puestos"),
  DEPILACION: V("depiladora", "depiladoras", "sesión", "sesiones", "cabina", "cabinas"),
  SPA: V("masajista", "masajistas", "sesión", "sesiones", "camilla", "camillas"),
  TATUAJES: V("tatuador", "tatuadores", "sesión", "sesiones", "box", "boxes"),
  COSMETOLOGIA: V("cosmetóloga", "cosmetólogas", "sesión", "sesiones", "cabina", "cabinas"),
};
