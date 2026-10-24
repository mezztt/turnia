import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { APP_NAME, OPENING_DAYS } from "../../config";
import { PoweredBy, TurniaLogo, useLightPage } from "../Brand";
import type { Venue } from "./types";
import { ConsumerButtons } from "./ConsumerButtons";

/** Marco de las webs públicas del local: encabezado con sus datos, contenido y pie legal */
export function Shell({ title, venue, heading, intro, children, bar, error }: {
  title: string; venue: Venue | null; heading: string; intro?: string; children?: ReactNode; bar?: ReactNode; error?: string;
}) {
  useLightPage();
  useEffect(() => { document.title = `${venue?.name ? venue.name + " · " : ""}${title}`; }, [venue?.name, title]);
  return (
    <div className="pb-page tn-pub-page">
      <header className="pb-hero">
        <div className="pb-wrap">
          <div className="pb-top"><TurniaLogo size={38} /><div><strong>{venue?.name || APP_NAME}</strong><small>{[venue?.address, venue?.phone].filter(Boolean).join(" · ") || title}</small></div></div>
          <h1>{heading}</h1>
          {intro && <p>{intro}</p>}
        </div>
      </header>
      <main className="pb-wrap pb-main">
        {error ? <div className="pb-card"><div className="pb-error" role="alert">{error}</div></div> : children}
        {venue && <VenueInfo venue={venue} />}
        {venue?.slug && !error && <ConsumerButtons slug={venue.slug} />}
      </main>
      {bar}
      <footer className="pb-foot"><PoweredBy /></footer>
    </div>
  );
}

function hoursText(venue: Venue): [string, string][] {
  return OPENING_DAYS.map(([k, label]) => [label, (venue.opening_hours?.[k] || []).map((r) => r.join(" a ")).join(" y ")] as [string, string]).filter(([, v]) => v);
}

/** Horarios, política de cancelación y ubicación */
export function VenueInfo({ venue }: { venue: Venue }) {
  const hours = hoursText(venue);
  return (
    <div className="pb-card">
      <span className="pb-step-label">Sobre el local</span>
      {hours.length > 0 && <p style={{ margin: "0 0 8px" }}>{hours.map(([d, h]) => <span key={d} style={{ display: "block", color: "#27122a", fontSize: 14 }}><b>{d}:</b> {h}</span>)}</p>}
      {venue.cancel_policy_text && <p className="tn-pub-legal">{venue.cancel_policy_text}</p>}
      <p className="tn-pub-legal">Precios finales, IVA incluido. Documento no válido como factura.</p>
    </div>
  );
}

export function Consent({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="tn-pub-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>Acepto los <Link to="/legal/terminos">Términos</Link> y la <Link to="/legal/privacidad">Política de privacidad</Link>, y que el local use mis datos para gestionar este turno (Ley 25.326).</span>
    </label>
  );
}
