import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { appApi, canAccess, cap, getSessionUser, iconFor, longDate, money, moduleLabel, pathFor, vocab } from "../../config";
import Icon from "../../components/Icons";
import { Loading, PageHeader, useRefreshKey } from "../../components/ui";
import Pendientes from "../../components/Pendientes";

interface Overview {
  date: string;
  appointments_today?: number;
  sales_today?: number;
  birthdays_today?: number;
}

/** Atajos del día a día (solo los módulos que el local tiene y el rol puede abrir) */
const SHORTCUTS = ["agenda", "clientes", "caja", "packs", "fichas", "servicios"];

function Inicio() {
  const user = getSessionUser();
  const v = vocab(user);
  const navigate = useNavigate();
  const refreshKey = useRefreshKey();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () => appApi<Overview>("/dashboard/summary").then(setData).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [refreshKey]);

  if (error) return <div className="tn-note tn-note-error">{error}</div>;
  if (!data) return <Loading />;

  const hour = new Date().getHours();
  const hello = hour < 13 ? "Buen día" : hour < 20 ? "Buenas tardes" : "Buenas noches";
  const shortcuts = SHORTCUTS.filter((m) => canAccess(user, m));
  const kpis: { label: string; value: string; note: string }[] = [];
  if (data.appointments_today !== undefined) kpis.push({ label: `${cap(v.turnos)} de hoy`, value: String(data.appointments_today), note: "Sin contar cancelados ni ausentes" });
  if (data.sales_today !== undefined) kpis.push({ label: "Ventas de hoy", value: money(data.sales_today), note: "Cobrado en caja · la propina va aparte" });
  if (data.birthdays_today !== undefined) kpis.push({ label: "Cumpleaños de hoy", value: String(data.birthdays_today), note: "Un saludo por WhatsApp suma" });

  return (
    <section className="products-page">
      <PageHeader eyebrow="INICIO" title={`${hello}, ${(user?.name || "").split(" ")[0]}`} subtitle={`${longDate(new Date())} · así viene el día en ${user?.company_name || "tu local"}.`} />

      <Pendientes />

      {kpis.length > 0 && (
        <div className="tn-kpis" data-tour="inicio-numeros">
          {kpis.map((k) => <div key={k.label} className="tn-kpi"><span>{k.label}</span><strong>{k.value}</strong><small>{k.note}</small></div>)}
        </div>
      )}

      {shortcuts.length > 0 && (
        <div className="tn-card" data-tour="atajos">
          <div className="tn-card-head"><div><h2>Atajos</h2><p>Lo que más se usa durante el día.</p></div></div>
          <div className="tn-shortcuts">
            {shortcuts.map((m) => (
              <button key={m} type="button" className="tn-shortcut" onClick={() => navigate(pathFor(m))}>
                <span aria-hidden="true"><Icon name={iconFor(m)} size={20} /></span>
                <strong>{moduleLabel(m)}</strong>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default Inicio;
