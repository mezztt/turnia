// Pasos del tutorial «¿Cómo funcionamos?» de Turnia, según el rol de quien entra.
// Solo se incluyen pantallas que esa persona realmente ve en su menú.
import { canAccess, splitList, vocab } from "../../config";
import type { SessionUser } from "../../config";
import type { TourStep } from "./Tour";

const nav = (m: string) => `[data-tour="nav-${m}"]`;

export function tourSteps(user: SessionUser | null): TourStep[] {
  if (!user) return [];
  const can = (m: string) => canAccess(user, m);
  const has = (m: string) => splitList(user.enabled_modules).includes(m);
  const v = vocab(user);
  const steps: TourStep[] = [];
  const add = (cond: boolean, s: TourStep) => { if (cond) steps.push(s); };
  const theme: TourStep = { selector: '[data-tour="theme"]', title: "Claro u oscuro", text: "Cambiá el aspecto de la pantalla según lo que te resulte más cómodo." };
  const help: TourStep = { selector: '[data-tour="tour-help"]', title: "¿Cómo funcionamos?", text: "Si querés volver a ver este recorrido, tocá este botón cuando quieras." };

  // ---------- PROFESIONAL: recorrido propio de 4 pasos ----------
  if (user.role === "PROFESIONAL") {
    add(true, { title: "Bienvenido a Turnia", text: `Este es tu espacio como ${v.profesional}: tu día, tus clientes y lo tuyo.` });
    add(can("agenda"), { selector: nav("agenda"), title: "Mi agenda", text: `Tus ${v.turnos} del día en orden. Tocá uno para ver el detalle y marcar cuando el cliente llegó, está en curso o terminó.` });
    add(can("fichas"), { selector: nav("fichas"), title: "Ficha del cliente", text: "Alergias, contraindicaciones, fórmulas y consentimientos de tus clientes, antes de empezar." });
    add(can("comisiones"), { selector: nav("comisiones"), title: "Mis comisiones", text: "Lo que vas generando en el período. Solo ves lo tuyo." });
    add(true, theme);
    add(true, help);
    return steps;
  }

  // ---------- dueño, encargado y recepción (6 a 9 pasos, solo lo habilitado) ----------
  add(true, { title: "Bienvenido a Turnia by Mezztt", text: "Te mostramos lo principal en un minuto. Solo vas a ver lo que tiene tu plan y lo que tu rol puede usar." });
  add(true, { selector: '[data-tour="menu"]', title: "Tus módulos", text: "El menú lateral muestra solo lo que contrataste. Los pendientes de Inicio te llevan directo a lo que hay que resolver hoy." });
  add(can("configuracion"), { selector: nav("configuracion"), title: "Configuración", text: "Elegí tu rubro, cargá los servicios sugeridos y tus horarios. Acá también están la política de seña, los mensajes y Mercado Pago." });
  add(can("servicios"), { selector: nav("servicios"), title: "Servicios y equipo", text: `Editá duraciones, tiempos de pose y quién hace qué. Cada ${v.profesional} tiene su propio horario.` });
  add(can("agenda"), { selector: nav("agenda"), title: "Agenda", text: `Tocá un hueco, cargá el ${v.turno} y arrastralo para moverlo. Los sobreturnos piden autorización.` });
  add(can("agenda"), { selector: '[data-tour="pendientes"]', title: "Mensajes del día", text: "Confirmá y recordá por WhatsApp con un toque: el sistema arma el mensaje y lo enviás vos." });
  add(can("recursos"), { selector: nav("recursos"), title: "Recursos", text: "Sillones, cabinas y equipos: el plano del día muestra qué está libre, ocupado o bloqueado por mantenimiento." });
  add(can("fidelizacion"), { selector: nav("fidelizacion"), title: "Fidelización", text: "Saludos de cumpleaños, clientes que no vuelven, puntos y reseñas. Los mensajes se arman solos y los enviás vos por WhatsApp." });
  add(can("fichas"), { selector: nav("fichas"), title: "Ficha y consentimientos", text: "Alergias, fórmulas y firma en tablet. La salud es dato sensible: recepción ve solo la alerta." });
  add(can("caja"), { selector: nav("caja"), title: "Caja y comisiones", text: `Cobrá el ${v.turno}, dejá la propina aparte y cerrá la caja.${has("comisiones") ? " Las comisiones se calculan solas." : ""} Los comprobantes son internos: Documento no válido como factura.` });
  add(true, theme);
  if (can("configuracion")) add(true, { selector: '[data-tour="tour-help"]', title: "¿Cómo funcionamos?", text: "Para volver a ver este recorrido: este botón, o Configuración → Ayuda." });
  else add(true, help);
  return steps;
}

/** Recorrido del panel general de Mezztt (superadmin) */
export function adminTourSteps(): TourStep[] {
  const a = (p: string) => `[data-tour="admin-${p}"]`;
  return [
    { title: "Bienvenido al panel de Turnia", text: "Desde acá administrás los locales que usan Turnia: qué módulos tienen habilitados, cuánto pagan y cómo se factura. Te mostramos lo principal." },
    { selector: a("inicio"), title: "Inicio", text: "El resumen: cuántos locales hay, qué se espera cobrar este mes, cuánto ya entró y los pedidos de baja pendientes." },
    { selector: a("sistemas"), title: "Sistemas", text: "Cada cliente es un sistema. Acá lo das de alta, elegís sus módulos (los que dependen de otros se marcan solos), el abono y podés resetear contraseñas." },
    { selector: a("pagos"), title: "Pagos", text: "Registrá lo que te paga cada cliente y mirá quién está al día y quién debe." },
    { selector: a("facturacion"), title: "Facturación", text: "Cotizaciones con pago inicial y abono mensual (más los planes trimestral y anual) y las facturas mensuales de cada sistema." },
    { selector: '[data-tour="theme"]', title: "Claro u oscuro", text: "Cambiá el aspecto de la pantalla según lo que te resulte más cómodo." },
    { selector: a("configuracion"), title: "Configuración", text: "Precios, enlaces de marca y copia de seguridad. Acá mismo está el botón «¿Cómo funcionamos?» para volver a ver este recorrido." },
  ];
}
