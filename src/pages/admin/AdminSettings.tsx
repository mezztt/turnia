import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { adminApi, adminDownload, money, plansFor, priceBreakdown, APP_NAME, DEFAULT_BRAND_LINKS } from "../../config";
import type { BillingPrices, BrandLinks } from "../../config";
import { startTour } from "../../components/tour/Tour";
import { resetBrandLinks } from "../../components/Brand";

// lo que devuelve el panel: precios + enlaces de marca (vacío = se usa el valor por defecto)
type BillingSettings = BillingPrices & { [K in keyof BrandLinks]?: string | null };
const emptyBrand: BrandLinks = { system_instagram_url: "", mezztt_instagram_url: "", mezztt_site_url: "" };

function AdminSettings() {
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [prices, setPrices] = useState<BillingSettings | null>(null);
  const [savingPrices, setSavingPrices] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [brand, setBrand] = useState<BrandLinks>(emptyBrand);
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandMsg, setBrandMsg] = useState<{ text: string; error: boolean } | null>(null);

  function loadSettings(s: BillingSettings) {
    setPrices(s);
    setBrand({ system_instagram_url: s.system_instagram_url || "", mezztt_instagram_url: s.mezztt_instagram_url || "", mezztt_site_url: s.mezztt_site_url || "" });
  }

  async function handleBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBrandMsg(null);
    const bad = Object.values(brand).find((v) => v.trim() && !/^https?:\/\//i.test(v.trim()));
    if (bad) return setBrandMsg({ text: "Los enlaces tienen que empezar con http:// o https://", error: true });
    setSavingBrand(true);
    try {
      loadSettings(await adminApi<BillingSettings>("/admin/billing-settings", {
        method: "PUT",
        body: { system_instagram_url: brand.system_instagram_url.trim(), mezztt_instagram_url: brand.mezztt_instagram_url.trim(), mezztt_site_url: brand.mezztt_site_url.trim() },
      }));
      resetBrandLinks();   // el pie y el login vuelven a pedirlos
      setBrandMsg({ text: "Enlaces guardados.", error: false });
    } catch (error) {
      setBrandMsg({ text: error instanceof Error ? error.message : "No se pudieron guardar los enlaces.", error: true });
    } finally {
      setSavingBrand(false);
    }
  }

  async function downloadBackup() {
    setDownloading(true);
    try {
      await adminDownload("/admin/backup", `turnia-backup-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo descargar la copia.");
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    adminApi<{ email: string }>("/admin/me").then((d) => setEmail(d.email)).catch(() => {});
    adminApi<BillingSettings>("/admin/billing-settings").then(loadSettings).catch(() => {});
  }, []);

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await adminApi("/admin/me/password", {
        method: "PUT",
        body: { current_password: currentPassword, new_password: newPassword },
      });
      alert("Contraseña actualizada.");
      setCurrentPassword(""); setNewPassword("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo cambiar la contraseña.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePrices(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prices) return;
    setSavingPrices(true);
    try {
      const updated = await adminApi<BillingSettings>("/admin/billing-settings", {
        method: "PUT",
        body: {
          base_cost: Number(prices.base_cost),
          module_price: Number(prices.module_price),
          web_price: Number(prices.web_price),
        },
      });
      loadSettings(updated);
      alert("Precios guardados.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudieron guardar los precios.");
    } finally {
      setSavingPrices(false);
    }
  }

  // ejemplo: peluquería con comisiones y turnos online (comisiones arrastra caja, turnos online arrastra agenda)
  const example = priceBreakdown(["comisiones", "web_turnos"], prices, false);

  return (
    <section className="products-page">
      <div className="products-header">
        <div>
          <span className="dashboard-eyebrow">MEZZTT · TURNIA</span>
          <h1>Configuración</h1>
          <p>Tu cuenta del panel, los precios de Turnia, la marca y la copia de seguridad.</p>
        </div>
      </div>

      <div className="tn-grid-2">
        <div className="dashboard-section">
          <div className="section-heading"><h2>Tu cuenta</h2><p>{email || "—"}</p></div>
          <form onSubmit={handlePassword} className="product-form">
            <div className="form-group">
              <label>Contraseña actual</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Contraseña nueva</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <button type="submit" className="primary-button" disabled={saving} style={{ alignSelf: "flex-start" }}>
              {saving ? "Guardando..." : "Cambiar contraseña"}
            </button>
          </form>
        </div>

        <div className="dashboard-section">
          <div className="section-heading"><h2>Precios (USD)</h2><p>Pago inicial = configuración + módulos + webs · Abono mensual = módulos + webs</p></div>
          {!prices ? <p className="tn-muted">Cargando…</p> : (
            <form onSubmit={handlePrices} className="product-form">
              <div className="form-group">
                <label>Configuración inicial de un local (se cobra una sola vez)</label>
                <input type="number" min="0" value={prices.base_cost} onChange={(e) => setPrices({ ...prices, base_cost: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Precio por módulo (en el pago inicial y en cada mes)</label>
                <input type="number" min="0" value={prices.module_price} onChange={(e) => setPrices({ ...prices, module_price: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Cada web: turnos online y vitrina del local</label>
                <input type="number" min="0" value={prices.web_price} onChange={(e) => setPrices({ ...prices, web_price: e.target.value })} />
              </div>
              <div className="tn-price-box">
                <small>Ejemplo: comisiones + turnos online. Comisiones arrastra caja y turnos online arrastra agenda, que también se cobran (sin IVA)</small>
                <div><span>Pago inicial (una sola vez)</span><strong>{money(example.initialSubtotal)}</strong></div>
                <div><span>Abono mensual</span><strong>{money(example.monthlySubtotal)}</strong></div>
                <div><span>Plan trimestral (1 mes gratis)</span><strong>{money(plansFor(example.monthlySubtotal).quarterly)}</strong></div>
                <div><span>Plan anual (2 meses gratis)</span><strong>{money(plansFor(example.monthlySubtotal).annual)}</strong></div>
              </div>
              <small className="tn-hint">Inicio, Servicios, Clientes, Configuración y Usuarios van incluidos: no se cobran. Los módulos que dependen de otros (comisiones, packs, productos y fidelización necesitan caja; fotos necesita fichas; recursos y turnos online necesitan agenda) se cobran junto con el que los necesita. La configuración no se cobra por mes. Trimestral: se pagan 2 meses de cada 3. Anual: se pagan 10 meses de 12. El pago inicial no se descuenta.</small>
              <button type="submit" className="primary-button" disabled={savingPrices} style={{ alignSelf: "flex-start" }}>
                {savingPrices ? "Guardando..." : "Guardar precios"}
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="dashboard-section" style={{ marginTop: 16 }}>
        <div className="section-heading"><h2>Marca y redes</h2><p>Enlaces que se ven en el ingreso, el menú y el pie de las páginas públicas</p></div>
        <form onSubmit={handleBrand} className="product-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="brand-system-ig">Instagram de {APP_NAME}</label>
              <input id="brand-system-ig" type="url" inputMode="url" value={brand.system_instagram_url} placeholder={DEFAULT_BRAND_LINKS.system_instagram_url}
                onChange={(e) => setBrand({ ...brand, system_instagram_url: e.target.value })} maxLength={255} />
            </div>
            <div className="form-group">
              <label htmlFor="brand-mezztt-ig">Instagram de Mezztt</label>
              <input id="brand-mezztt-ig" type="url" inputMode="url" value={brand.mezztt_instagram_url} placeholder={DEFAULT_BRAND_LINKS.mezztt_instagram_url}
                onChange={(e) => setBrand({ ...brand, mezztt_instagram_url: e.target.value })} maxLength={255} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="brand-mezztt-site">Página de Mezztt</label>
            <input id="brand-mezztt-site" type="url" inputMode="url" value={brand.mezztt_site_url} placeholder="https://mezztt.site"
              onChange={(e) => setBrand({ ...brand, mezztt_site_url: e.target.value })} maxLength={255} />
            <small className="tn-hint">Si la dejás vacía, donde dice “Mezztt” se abre el Instagram de Mezztt. Un campo vacío usa el enlace que se ve en gris.</small>
          </div>
          {brandMsg && <div className={`tn-note ${brandMsg.error ? "tn-note-error" : "tn-note-info"}`} role="status">{brandMsg.text}</div>}
          <button type="submit" className="primary-button" disabled={savingBrand} style={{ alignSelf: "flex-start" }}>
            {savingBrand ? "Guardando..." : "Guardar enlaces"}
          </button>
        </form>
      </div>

      <div className="dashboard-section" style={{ marginTop: 16 }}>
        <div className="section-heading"><h2>¿Cómo funcionamos?</h2><p>Volvé a ver el recorrido por el sistema.</p></div>
        <button type="button" className="secondary-button" onClick={startTour} style={{ alignSelf: "flex-start" }}>Ver el recorrido</button>
      </div>

      <div className="dashboard-section" style={{ marginTop: 16 }}>
        <div className="section-heading"><h2>Copia de seguridad</h2><p>Solo vos la ves: los clientes no tienen esta opción</p></div>
        <div className="product-form">
          <p className="tn-muted" style={{ margin: 0 }}>
            Descarga un archivo con todos los datos de todos los sistemas (servicios, clientes, turnos, fichas, caja, productos, comisiones…).
            Guardalo en un lugar seguro: tiene datos personales de clientes y empleados.
          </p>
          <button type="button" className="primary-button" onClick={downloadBackup} disabled={downloading} style={{ alignSelf: "flex-start" }}>
            {downloading ? "Preparando la copia..." : "Descargar copia"}
          </button>
        </div>
      </div>
    </section>
  );
}

export default AdminSettings;
