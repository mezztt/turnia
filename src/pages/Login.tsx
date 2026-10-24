import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, ADMIN_TOKEN_KEY, APP_NAME, TOKEN_KEY, USER_KEY, publicApi } from "../config";
import { Field, Modal, strOrNull } from "../components/ui";
import { BrandWordmark, InstagramLink, LegalLinks, useBrandLinks } from "../components/Brand";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const links = useBrandLinks();
  const [bajaOpen, setBajaOpen] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!email.trim()) return setError("Escribí tu email para ingresar.");
    if (!password) return setError("Escribí tu contraseña para ingresar.");
    setLoading(true);
    try {
      // 1) ¿Es el panel general (Mezztt)?
      const adminRes = await fetch(`${API_URL}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (adminRes.ok) {
        const data = await adminRes.json();
        localStorage.setItem(ADMIN_TOKEN_KEY, data.access_token);
        navigate("/admin");
        return;
      }

      // 2) Si no, es un usuario de un local
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "El email o la contraseña son incorrectos.");

      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      navigate("/app");
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "No se pudo conectar con el servidor."
          : err instanceof Error ? err.message : "No se pudo ingresar."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page tn-login">
      <section className="login-card">
        <div className="login-brand">
          <BrandWordmark size={52} instagram tagline="Agenda y gestión para belleza, estética y tatuajes" />
        </div>

        <ul className="tn-login-points" aria-label="Qué incluye">
          <li><b>▦</b>Agenda por profesional, fichas y caja</li>
          <li><b>⌂</b>Turnos online con seña y vitrina para Instagram</li>
          <li><b>▤</b>Comisiones, packs y fidelización de clientes</li>
        </ul>

        <div className="login-heading">
          <h2>Bienvenido</h2>
          <p>Ingresá a tu cuenta para continuar.</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" spellCheck={false} autoCapitalize="none" placeholder="tu@email.com" value={email}
              onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-button" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <div className="login-footer tn-login-foot">
          <span className="tn-follow">Seguinos <InstagramLink href={links.system_instagram_url} label={`Seguí a ${APP_NAME} en Instagram`} /></span>
          <LegalLinks />
          <button type="button" className="tn-link-button" onClick={() => setBajaOpen(true)}>Dar de baja el servicio</button>
        </div>
      </section>
      {bajaOpen && <BajaModal onClose={() => setBajaOpen(false)} />}
    </main>
  );
}

function BajaModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  async function send() {
    setSaving(true); setError("");
    try {
      const r = await publicApi<{ code: string }>("/public/cancellation-request", { method: "POST", body: { email, reason: strOrNull(reason) } });
      setCode(r.code);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo registrar el pedido"); } finally { setSaving(false); }
  }
  return (
    <Modal eyebrow="BAJA DEL SERVICIO" title="Dar de baja el servicio" onClose={onClose}
      footer={code
        ? <button className="login-button" onClick={onClose}>Listo</button>
        : <><button className="secondary-button" onClick={onClose}>Volver</button><button className="tn-danger-button" onClick={send} disabled={saving || !email.trim()}>{saving ? "Enviando..." : "Avisar a Mezztt"}</button></>}>
      {code ? (
        <div className="product-form">
          <p>Recibimos tu pedido. Guardá este código: <strong>{code}</strong></p>
          <p className="tn-muted">Te respondemos dentro de las 24 horas. Para que la baja tenga efecto, el administrador la confirma desde Configuración → «Dar de baja el servicio».</p>
        </div>
      ) : (
        <div className="product-form">
          <p><strong>Si podés ingresar:</strong> entrá como administrador y usá «Dar de baja el servicio» (Configuración o el menú). Se confirma en dos pasos, te da la constancia al instante y seguís usando el sistema hasta el final del período que ya pagaste.</p>
          <p className="tn-muted">Si no podés ingresar, dejanos el email del administrador y te contactamos dentro de las 24 horas (Disposición 954/2025). Tus datos son tuyos: podés pedir una copia antes de la baja.</p>
          <Field label="Email del administrador del local"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" /></Field>
          <Field label="Motivo (opcional)"><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          {error && <div className="tn-note tn-note-error">{error}</div>}
        </div>
      )}
    </Modal>
  );
}

export default Login;
