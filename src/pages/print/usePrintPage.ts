import { useEffect } from "react";

/** Las hojas imprimibles se ven siempre en claro, aunque el sistema esté en modo oscuro */
export function useLightPage() {
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    return () => { if (prev) root.setAttribute("data-theme", prev); else root.removeAttribute("data-theme"); };
  }, []);
}
