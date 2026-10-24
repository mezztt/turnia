// Estado vacío de un módulo cuya pantalla todavía no está hecha (andamio de Turnia).
// Cada agente de fase 2 reemplaza el Index.tsx del módulo por la pantalla real y deja de usar este componente.
import Icon from "./Icons";
import { PageHeader } from "./ui";
import { getSessionUser, iconFor, moduleHint, moduleLabel, vocab } from "../config";

export default function ModuleStub({ module, lines }: { module: string; lines?: string[] }) {
  const user = getSessionUser();
  const v = vocab(user);
  const fill = (t: string) => t.replace(/\{turnos\}/g, v.turnos).replace(/\{turno\}/g, v.turno).replace(/\{profesionales\}/g, v.profesionales).replace(/\{profesional\}/g, v.profesional);
  return (
    <section className="products-page" data-module-stub={module}>
      <PageHeader eyebrow={moduleLabel(module).toUpperCase()} title={moduleLabel(module)} subtitle={fill(moduleHint(module))} />
      <div className="tn-card">
        <div className="tn-empty" role="status">
          <span aria-hidden="true"><Icon name={iconFor(module)} size={34} /></span>
          <strong>Esta pantalla se está terminando</strong>
          El módulo ya está activo en tu plan. En cuanto esté lista vas a poder usarlo desde acá.
          {lines && lines.length > 0 && (
            <ul className="tn-stub-list">{lines.map((l) => <li key={l}>{fill(l)}</li>)}</ul>
          )}
        </div>
      </div>
    </section>
  );
}
