import { useEffect, useState } from "react";
import Icon from "../../components/Icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  appApi, canAccess, getSessionUser, ROLE_LABELS, THEME_KEY, TOKEN_KEY, USER_KEY, longDate, NAV, APP_NAME, cap, vocab,
} from "../../config";
import type { SessionUser } from "../../config";
import NotificationsBell from "../../components/NotificationsBell";
import { TurniaLogo, SidebarSignature } from "../../components/Brand";
import Tour, { startTour } from "../../components/tour/Tour";
import Assistant from "../../components/Assistant";
import { BajaBanner } from "../../components/BajaServicio";
import { tourSteps } from "../../components/tour/steps";

function ClientLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<SessionUser | null>(getSessionUser());
  const [clock, setClock] = useState(new Date());
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "light");
  const [refreshKey, setRefreshKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);   // en el celular el menú se abre con un botón

  // refresca módulos/rol por si los cambiaron desde el panel general
  useEffect(() => {
    appApi<SessionUser>("/auth/me")
      .then((me) => { localStorage.setItem(USER_KEY, JSON.stringify(me)); setUser(me); })
      .catch(() => {});
    const t = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // si el plan no tiene la pantalla o el rol no puede verla, vuelve al inicio
  useEffect(() => {
    if (!user) return;
    const item = NAV.find((n) => n.path !== "/app" && (location.pathname === n.path || location.pathname.startsWith(n.path + "/")));
    if (item && !canAccess(user, item.module)) navigate("/app", { replace: true });
  }, [user, location.pathname, navigate]);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const visible = NAV.filter((n) => canAccess(user, n.module));
  const sections = (["DÍA A DÍA", "GESTIÓN", "LOCAL"] as const)
    .map((s) => ({ section: s, items: visible.filter((n) => n.section === s) }))
    .filter((s) => s.items.length);
  const current = NAV.filter((n) => n.path !== "/app" && (location.pathname === n.path || location.pathname.startsWith(n.path + "/")))[0]?.module || "inicio";

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = "/";
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <div className={`app-layout ${menuOpen ? "tn-menu-open" : ""}`}>
      {menuOpen && <button type="button" className="tn-menu-backdrop" aria-label="Cerrar el menú" onClick={() => setMenuOpen(false)} />}
      <aside className="sidebar" id="tn-sidebar">
        <div className="sidebar-brand">
          <TurniaLogo size={40} />
          <div className="sidebar-brand-text">
            <strong>{user?.company_name || APP_NAME}</strong>
            <span>{APP_NAME} · agenda y gestión</span>
          </div>
        </div>
        <nav className="sidebar-nav" data-tour="menu">
          {sections.map((s) => (
            <div key={s.section}>
              {sections.length > 1 && <div className="nav-section">{s.section}</div>}
              {s.items.map((n) => (
                <button key={n.module} data-tour={`nav-${n.module}`} className={`nav-item ${current === n.module ? "active" : ""}`} onClick={() => navigate(n.path)}>
                  <span aria-hidden="true"><Icon name={n.icon} /></span>
                  <span className="nav-item-text">{n.module === "recursos" ? cap(vocab(user).puestos) : n.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="tn-user-mini">
            <strong>{user?.name}</strong>
            <span>{ROLE_LABELS[user?.role || ""] || user?.role}</span>
          </div>
          <button className="logout-button" data-tour="theme" onClick={toggleTheme} style={{ marginBottom: 6 }}>
            <span className="nav-item-text with-icon"><Icon name={theme === "dark" ? "sun" : "moon"} size={15} />{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
          </button>
          <button className="logout-button" data-tour="tour-help" onClick={startTour} style={{ marginBottom: 6 }}><span className="nav-item-text with-icon"><Icon name="help" size={15} />¿Cómo funcionamos?</span></button>
          {user?.role === "ADMINISTRADOR" && <button className="logout-button" data-testid="baja-link" onClick={() => { setMenuOpen(false); navigate("/app/configuracion", { state: { tab: "bajas" } }); }} style={{ marginBottom: 6 }}><span className="nav-item-text with-icon"><Icon name="logout" size={15} />Dar de baja el servicio</span></button>}
          <button className="logout-button" onClick={logout}><span className="nav-item-text with-icon"><Icon name="logout" size={15} />Cerrar sesión</span></button>
          <SidebarSignature />
        </div>
      </aside>
      {user && <Tour steps={tourSteps(user)} storageKey={`turnia_${user.role.toLowerCase()}_${user.id ?? "x"}`} />}
      <Assistant user={user} />
      <div className="main-area">
        <header className="tn-topbar">
          <button type="button" className="tn-menu-button" aria-label="Abrir el menú" aria-expanded={menuOpen} aria-controls="tn-sidebar"
            onClick={() => setMenuOpen(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <div className="tn-topbar-when">
            <span className="tn-topbar-date">{longDate(clock)}</span>
            <strong className="tn-topbar-clock">{clock.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })}</strong>
          </div>
          <div className="tn-topbar-right">
            <span data-tour="bell" className="tn-tour-wrap"><NotificationsBell onNew={() => setRefreshKey((k) => k + 1)} /></span>
          </div>
        </header>
        <main className="page-content">
          {/* refreshKey: cuando llega un aviso nuevo, las pantallas se recargan solas */}
          {user?.role === "ADMINISTRADOR" && <BajaBanner />}
          <Outlet context={{ refreshKey }} />
        </main>
      </div>
    </div>
  );
}

export default ClientLayout;
