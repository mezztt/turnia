import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { THEME_KEY } from "./config";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

// Panel general (Mezztt)
import AdminLayout from "./pages/admin/AdminLayout";
import AdminHome from "./pages/admin/AdminHome";
import Sistemas from "./pages/admin/Sistemas";
import Pagos from "./pages/admin/Pagos";
import AdminBilling from "./pages/admin/AdminBilling";
import AdminSettings from "./pages/admin/AdminSettings";
import MailCenter from "./pages/admin/MailCenter";

// Sistema del local
import ClientLayout from "./pages/app/ClientLayout";
import Inicio from "./pages/app/Inicio";
import Usuarios from "./pages/app/Usuarios";
import Configuracion from "./pages/app/Configuracion";
// un archivo por módulo (cada agente completa el suyo; hoy son páginas stub con estado vacío)
import AgendaPage from "./pages/app/agenda/Index";
import FichasPage from "./pages/app/fichas/Index";
import FotosPage from "./pages/app/fotos/Index";
import CajaPage from "./pages/app/caja/Index";
import ProductosPage from "./pages/app/productos/Index";
import ComisionesPage from "./pages/app/comisiones/Index";
import PacksPage from "./pages/app/packs/Index";
import FidelizacionPage from "./pages/app/fidelizacion/Index";
import RecursosPage from "./pages/app/recursos/Index";
import BioseguridadPage from "./pages/app/bioseguridad/Index";
import ReportesPage from "./pages/app/reportes/Index";
import ServiciosPage from "./pages/app/servicios/Index";
import ClientesPage from "./pages/app/clientes/Index";

// Hoja para imprimir (cartel del libro de quejas)
import PrintCartel from "./pages/print/PrintCartel";

// Webs públicas del local
import ReservarTurno from "./pages/public/ReservarTurno";
import Vitrina from "./pages/public/Vitrina";
import MiTurno from "./pages/public/MiTurno";
import Legal from "./pages/public/Legal";

function App() {
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) || "light";
    // las páginas públicas se ven siempre en claro (lo fuerza useLightPage)
    if (/^\/(t|v|mi-turno|resena|mi-pack|legal)\//.test(window.location.pathname)) return;
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        {/* PANEL GENERAL (Mezztt) */}
        <Route element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route path="/admin" element={<AdminHome />} />
          <Route path="/admin/sistemas" element={<Sistemas />} />
          <Route path="/admin/pagos" element={<Pagos />} />
          <Route path="/admin/facturacion" element={<AdminBilling />} />
          <Route path="/admin/correos" element={<MailCenter />} />
          <Route path="/admin/configuracion" element={<AdminSettings />} />
        </Route>

        {/* SISTEMA DEL LOCAL */}
        <Route element={<ProtectedRoute><ClientLayout /></ProtectedRoute>}>
          <Route path="/app" element={<Inicio />} />
          <Route path="/app/agenda" element={<AgendaPage />} />
          <Route path="/app/fichas" element={<FichasPage />} />
          <Route path="/app/fotos" element={<FotosPage />} />
          <Route path="/app/caja" element={<CajaPage />} />
          <Route path="/app/productos" element={<ProductosPage />} />
          <Route path="/app/comisiones" element={<ComisionesPage />} />
          <Route path="/app/packs" element={<PacksPage />} />
          <Route path="/app/fidelizacion" element={<FidelizacionPage />} />
          <Route path="/app/recursos" element={<RecursosPage />} />
          <Route path="/app/bioseguridad" element={<BioseguridadPage />} />
          <Route path="/app/reportes" element={<ReportesPage />} />
          <Route path="/app/servicios" element={<ServiciosPage />} />
          <Route path="/app/clientes" element={<ClientesPage />} />
          <Route path="/app/usuarios" element={<Usuarios />} />
          <Route path="/app/configuracion" element={<Configuracion />} />
        </Route>

        {/* HOJAS PARA IMPRIMIR (con login, sin menú) */}
        <Route path="/print/cartel/quejas" element={<ProtectedRoute><PrintCartel /></ProtectedRoute>} />

        {/* WEBS PÚBLICAS (sin login) */}
        <Route path="/t/:slug" element={<ReservarTurno />} />
        <Route path="/v/:slug" element={<Vitrina />} />
        <Route path="/mi-turno/:token" element={<MiTurno kind="turno" />} />
        <Route path="/resena/:token" element={<MiTurno kind="resena" />} />
        <Route path="/mi-pack/:token" element={<MiTurno kind="pack" />} />

        {/* LEGALES (sin login) */}
        <Route path="/legal/terminos" element={<Legal doc="terminos" />} />
        <Route path="/legal/privacidad" element={<Legal doc="privacidad" />} />
        <Route path="/legal/baja" element={<Legal doc="baja" />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
