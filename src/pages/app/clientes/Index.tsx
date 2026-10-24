// Clientes (G3): directorio con búsqueda y filtros, ficha-resumen, historial, WhatsApp y datos personales.
import { useEffect, useState } from "react";
import { getSessionUser, vocab } from "../../../config";
import { EmptyAction } from "../../../components/r1/common";
import { Empty, Loading, PageHeader, Pill, useFlash } from "../../../components/ui";
import { ErrorNote, WaButton, dmy, useLoad } from "../../../components/g3/common";
import { CustomerDetail, CustomerForm } from "../../../components/g3/ClientesParts";
import type { Cust } from "../../../components/g3/ClientesParts";

const FILTERS: [string, string][] = [["", "Todos"], ["inactivos", "Inactivos (60 días)"], ["noshow", "Con ausencias"], ["cumple", "Cumpleaños próximos"], ["alergias", "Con alertas de salud"], ["bloqueados", "Con seña obligatoria"], ["menores", "Menores"]];

export default function ClientesPage() {
  const user = getSessionUser();
  const v = vocab(user);
  const flash = useFlash();
  const front = user?.role !== "PROFESIONAL";
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [filter, setFilter] = useState("");
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((n) => n + 1);
  useEffect(() => { const t = window.setTimeout(() => setDq(q), 300); return () => window.clearTimeout(t); }, [q]);
  const { data, error, loading } = useLoad<Cust[]>(`/customers?limit=300${filter ? `&filter=${filter}` : ""}${dq.trim() ? `&q=${encodeURIComponent(dq.trim())}` : ""}&v=${version}`);
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<Cust | "new" | null>(null);
  return (
    <div data-tour="clientes">
      <PageHeader eyebrow="CLIENTES" title="Clientes" subtitle={user?.role === "PROFESIONAL" ? `Los clientes que atendés.` : `Tu directorio: contacto, historial y ${v.turnos}.`}>
        {front && <button className="primary-button" onClick={() => setForm("new")}>Nuevo cliente</button>}
      </PageHeader>
      <div className="tn-toolbar">
        <input className="tn-search" placeholder="Buscar por nombre, teléfono o DNI" aria-label="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filtro" value={filter} onChange={(e) => setFilter(e.target.value)} className="tn-select">
          {FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <ErrorNote text={error} />
      {loading && !data && <Loading />}
      {data && data.length === 0 && !q && !filter && (
        <EmptyAction title="Todavía no hay clientes" text={`Se cargan al agendar el primer ${v.turno} o desde acá.`} action={front ? "Cargar el primero" : undefined} onAction={() => setForm("new")} />)}
      {data && data.length === 0 && (q || filter) && <Empty title="No encontramos clientes con eso">Probá con otro nombre o sacá el filtro.</Empty>}
      {data && data.length > 0 && (
        <div className="tn-table-wrap">
          <table className="tn-table">
            <thead><tr><th>Cliente</th><th>Contacto</th><th>Visitas</th><th>Avisos</th><th /></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="is-click" tabIndex={0} onClick={() => setOpen(c.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(c.id)}>
                  <td><strong>{c.name}</strong>{c.tags.length > 0 && <small>{c.tags.join(" · ")}</small>}</td>
                  <td>{c.phone || <span className="tn-muted">Sin teléfono</span>}{c.email && <small>{c.email}</small>}</td>
                  <td>{c.visits_count}{c.last_visit_at && <small>última el {dmy(c.last_visit_at)}</small>}</td>
                  <td><div className="tn-row">
                    {c.health_alert && <Pill tone="red">Salud</Pill>}
                    {c.no_show_count > 0 && <Pill tone="red">{c.no_show_count} aus.</Pill>}
                    {c.require_deposit && <Pill tone="violet">Seña</Pill>}
                    {c.is_minor && <Pill tone="orange">Menor</Pill>}
                    {c.credit_balance > 0 && <Pill tone="green">A favor</Pill>}
                  </div></td>
                  <td onClick={(e) => e.stopPropagation()}><WaButton phoneWa={c.phone_wa} text={`Hola ${c.name.split(" ")[0]}, te escribimos de ${user?.company_name || "el local"}.`} /></td>
                </tr>))}
            </tbody>
          </table>
        </div>)}
      {open !== null && <CustomerDetail id={open} tattoo={!!user?.tattoo_mode} onClose={() => setOpen(null)} onChanged={bump} onEdit={(c) => { setOpen(null); setForm(c); }} />}
      {form && <CustomerForm c={form === "new" ? null : form} tattoo={!!user?.tattoo_mode} onClose={() => setForm(null)} onSaved={(c) => { setForm(null); bump(); flash.show("Cliente guardado"); setOpen(c.id); }} />}
      {flash.node}
    </div>
  );
}
