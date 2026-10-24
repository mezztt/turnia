// Ficha de un cliente: resumen, salud, historial, consentimientos y fotos. Reutilizable desde Fichas y desde otras pantallas.
import { useCallback, useEffect, useState } from "react";
import { appApi, getSessionUser, shortDate, splitList } from "../../config";
import { Loading, Pill, Tabs } from "../ui";
import { ConsentsTab } from "./ConsentForms";
import { HistorialTab } from "./RecordForms";
import FotosCliente from "../fotos/FotosCliente";
import { SaludTab } from "./SaludTab";
import TattooWizard from "./TattooWizard";
import { PATCH_LABEL, SEVERITY_LABEL, SEVERITY_TONE } from "./shared";
import type { Ficha } from "./shared";


interface Notify { show: (t: string, error?: boolean) => void; fail: (e: unknown) => void }
type Tab = "resumen" | "salud" | "historial" | "consentimientos" | "fotos";

export default function FichaCliente({ customerId, notify, initialTab }: { customerId: number; notify: Notify; initialTab?: Tab }) {
  const user = getSessionUser();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(initialTab || "resumen");
  const [wizard, setWizard] = useState(false);
  const reload = useCallback(async () => {
    try { setFicha(await appApi<Ficha>(`/customers/${customerId}/ficha`)); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo abrir la ficha"); }
  }, [customerId]);
  useEffect(() => { setFicha(null); reload(); }, [reload]);

  if (error) return <div className="tn-note tn-note-error" role="alert">{error}</div>;
  if (!ficha) return <Loading />;
  const c = ficha.customer;
  const full = ficha.view === "full";
  const hasFotos = splitList(user?.enabled_modules).includes("fotos") && user?.role !== "RECEPCION";
  const grave = (ficha.flags || []).filter((f) => f.active && (f.severity === "GRAVE" || f.severity === "ATENCION"));
  const tabs: [Tab, string][] = full ? [["resumen", "Resumen"], ["salud", "Salud"], ["historial", "Historial"], ["consentimientos", "Consentimientos"]] : [["resumen", "Resumen"], ["consentimientos", "Consentimientos"]];
  if (hasFotos) tabs.push(["fotos", "Fotos"]);
  const current = tabs.some(([k]) => k === tab) ? tab : "resumen";
  const patch = ficha.patch ? PATCH_LABEL[ficha.patch.status] : null;
  const wa = c.phone_wa ? `https://wa.me/${c.phone_wa}` : null;

  return (
    <div className="tn-stack">
      {ficha.alert.has_alert && (
        <div className="g2-banner" role="alert"><span aria-hidden="true">!</span>
          <div>
            <strong>{c.name} tiene alertas de salud{full ? "" : ": ver ficha"}</strong>
            {full && grave.length > 0 && <ul>{grave.map((f) => <li key={f.id}>{f.kind_label}: {f.text} ({SEVERITY_LABEL[f.severity]})</li>)}</ul>}
          </div>
        </div>)}
      {c.is_minor && (
        <div className="g2-banner is-warn"><span aria-hidden="true">i</span>
          <div><strong>Es menor de {c.minor_limit} años{c.age !== null ? ` (${c.age})` : ""}</strong>
            <span style={{ color: "var(--tn-ink)", fontSize: 13.5 }}>{c.guardian_name ? `Tutor: ${c.guardian_name}${c.guardian_dni_text ? ` · DNI ${c.guardian_dni_text}` : ""}${c.guardian_phone ? ` · ${c.guardian_phone}` : ""}` : "Falta cargar el padre, madre o tutor."}</span></div>
        </div>)}

      <div className="tn-card">
        <div className="g2-head">
          <div><h2>{c.name}</h2><small>{[c.phone, c.age !== null ? `${c.age} años` : null, c.dni_text ? `DNI ${c.dni_text}` : null].filter(Boolean).join(" · ") || "Sin datos de contacto"}</small></div>
          <div className="g2-row-actions">
            {wa && <a className="secondary-button" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
            {ficha.tattoo_mode && <button className="primary-button" data-tour="fichas-trabajo" onClick={() => setWizard(true)}>Nuevo trabajo</button>}
            <button className="secondary-button" onClick={reload}>Actualizar</button>
          </div>
        </div>
      </div>

      <Tabs value={current} options={tabs} onChange={setTab} />

      {current === "resumen" && (
        <div className="tn-stack">
          <div className="tn-card">
            <dl className="g2-dl">
              <dt>Declaración de salud</dt><dd>{ficha.health_declared ? "Firmada" : "Sin declaración"}</dd>
              {patch && <><dt>Test de parche</dt><dd><Pill tone={patch[1]}>{patch[0]}</Pill>{ficha.patch?.valid_until ? ` · ${ficha.patch.status === "VENCIDO" ? "venció el" : "vigente hasta"} ${shortDate(ficha.patch.valid_until)}` : ""}</dd></>}
              {full && <><dt>Entradas en el historial</dt><dd>{ficha.counts?.records ?? 0}</dd><dt>Consentimientos</dt><dd>{ficha.counts?.consents ?? 0}</dd></>}
              {full && ficha.flags && <><dt>Datos de salud activos</dt><dd>{ficha.flags.filter((f) => f.active).map((f) => <Pill key={f.id} tone={SEVERITY_TONE[f.severity]}>{f.text}</Pill>)}{!ficha.flags.some((f) => f.active) && "Ninguno"}</dd></>}
            </dl>
          </div>
          {full && ficha.last_formula && (
            <div className="tn-card"><h2 style={{ marginTop: 0 }}>Última fórmula</h2><small>{shortDate(ficha.last_formula.date)}{ficha.last_formula.professional_name ? ` · ${ficha.last_formula.professional_name}` : ""}</small>
              <dl className="g2-dl">{Object.entries(ficha.last_formula.data).map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt>{k.replace(/_/g, " ")}</dt><dd>{String(v === true ? "Sí" : v === false || v === "" || v === null ? "—" : v)}</dd></div>)}</dl></div>)}
          {!full && <div className="tn-note tn-note-info">Recepción ve solo el aviso de alerta. El detalle de salud lo ve quien atiende.</div>}
          <div className="tn-row">
            <button className="secondary-button" onClick={() => setTab("historial")}>Nueva entrada</button>
            {full && <button className="secondary-button" onClick={() => setTab("salud")}>Registrar alergia</button>}
            <button className="secondary-button" onClick={() => setTab("consentimientos")}>Firmar consentimiento</button>
          </div>
        </div>)}
      {current === "salud" && <SaludTab ficha={ficha} notify={notify} onChanged={reload} />}
      {current === "historial" && <HistorialTab ficha={ficha} notify={notify} onChanged={reload} />}
      {current === "consentimientos" && <ConsentsTab ficha={ficha} notify={notify} onChanged={reload} />}
      {current === "fotos" && <FotosCliente customer={c} notify={notify} />}
      {wizard && <TattooWizard ficha={ficha} reload={reload} notify={notify} onClose={() => setWizard(false)} />}
    </div>
  );
}
