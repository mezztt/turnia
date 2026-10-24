import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { APP_BRAND, APP_NAME } from "../../config";
import { InstagramLink, MezzttLink, TurniaLogo, PoweredBy, useBrandLinks, useLightPage } from "../../components/Brand";

/**
 * Textos legales públicos (sin login): /legal/terminos, /legal/privacidad y /legal/baja.
 * Son textos generales del servicio; no reemplazan el asesoramiento de un profesional (ver LEGAL.md).
 */
const UPDATED = "octubre de 2026";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="lg-section"><h2>{title}</h2>{children}</section>;
}

function Contact() {
  const links = useBrandLinks();
  return (
    <p className="lg-contact">
      Escribinos por el Instagram de <MezzttLink />
      <InstagramLink href={links.mezztt_instagram_url} label={`Instagram de ${APP_BRAND}`} />
    </p>
  );
}

function Terminos() {
  return (
    <>
      <p className="lg-lead">
        Estas son las condiciones para usar {APP_NAME}. Están escritas en lenguaje simple. Si usás el sistema, entendemos que las aceptás.
      </p>
      <Section title="1. Qué es Turnia">
        <p>{APP_NAME} es un sistema de agenda y gestión para peluquerías, barberías, centros de estética, uñas, depilación, spas, estudios de tatuajes y cosmetología: servicios y equipo, clientes, turnos, fichas, caja, comisiones, packs y más, según los módulos que cada local contrate. Puede incluir páginas públicas del local: turnos online y vitrina.</p>
      </Section>
      <Section title="2. Quién presta el servicio">
        <p>El servicio lo presta {APP_BRAND}, que desarrolla y mantiene el sistema. El cliente es el local que lo contrata, y es quien decide qué personas de su equipo tienen usuario y qué puede hacer cada una.</p>
      </Section>
      <Section title="3. Cuenta, contraseñas y PIN">
        <ul>
          <li>Cada usuario es personal. No compartas tu contraseña ni tu PIN.</li>
          <li>El PIN autoriza acciones sensibles (anulaciones, descuentos, sobreturnos) y queda registrado junto con quién lo usó.</li>
          <li>El cliente es responsable de lo que se hace con los usuarios que crea y de darlos de baja cuando alguien deja de trabajar con él.</li>
          <li>Si creés que alguien entró con tu usuario, cambiá la contraseña y avisanos.</li>
        </ul>
      </Section>
      <Section title="4. Uso permitido">
        <ul>
          <li>El sistema es para la actividad comercial del cliente. No se puede usar para fines ilegales ni para cargar datos de personas sin tener derecho a hacerlo.</li>
          <li>No está permitido intentar entrar a datos de otros clientes, copiar el sistema ni afectar su funcionamiento.</li>
          <li>{APP_NAME} es una herramienta de registro y organización. No reemplaza el criterio profesional ni las habilitaciones del local.</li>
        </ul>
      </Section>
      <Section title="5. Fichas, consentimientos y salud">
        <p>{APP_NAME} permite registrar alergias, contraindicaciones, fórmulas y consentimientos informados. Lo que se carga es responsabilidad del local y de sus profesionales: {APP_BRAND} no verifica su exactitud ni reemplaza la evaluación del profesional. Para estudios de tatuajes y piercing, el local es responsable de cumplir la normativa aplicable (en Mendoza, la Ley 7434 y el Decreto 56/07), incluida la edad mínima, la autorización de menores y la conservación de los consentimientos.</p>
      </Section>
      <Section title="6. Comprobantes y facturación">
        <ul>
          <li>{APP_NAME} <b>no emite</b> comprobantes fiscales de ARCA. Los recibos, comprobantes y cierres que imprime son documentos internos: <b>Documento no válido como factura</b>.</li>
          <li>La facturación electrónica y los impuestos del local son responsabilidad del local y de su contador.</li>
        </ul>
      </Section>
      <Section title="7. Mensajes y WhatsApp">
        <p>{APP_NAME} arma los mensajes de confirmación, recordatorio y reseña y abre WhatsApp con el texto listo; <b>el envío lo hace siempre una persona del local</b>. No enviamos mensajes automáticos ni usamos la API de WhatsApp.</p>
      </Section>
      <Section title="8. Pagos con Mercado Pago">
        <p>Si el local conecta su cuenta de Mercado Pago para cobrar señas online, el cobro se procesa en Mercado Pago, con las credenciales del propio local. {APP_NAME} no guarda datos de tarjetas. Las comisiones, contracargos y devoluciones son una relación entre el local, el cliente y Mercado Pago. La política de seña y cancelación la define cada local y se muestra antes de reservar.</p>
      </Section>
      <Section title="9. Abono y baja del servicio">
        <ul>
          <li>El servicio tiene un pago inicial y un abono mensual según los módulos contratados, acordados con {APP_BRAND} antes de empezar. Los módulos que dependen de otros incluyen lo necesario para funcionar, y eso se informa en la cotización.</li>
          <li>Podés pedir la baja cuando quieras, con el botón «Dar de baja el servicio» (en Configuración y en el menú; si no podés ingresar, también desde la pantalla de ingreso), sin motivo ni trámites previos y con constancia al instante. El sistema sigue funcionando hasta el final del período ya pagado, de acuerdo con la Disposición 954/2025 de la Subsecretaría de Defensa del Consumidor y Lealtad Comercial (Ministerio de Economía). También podés ejercer el arrepentimiento dentro de los plazos legales. Ver <Link to="/legal/baja">Baja y arrepentimiento</Link>.</li>
          <li>Si el abono queda impago, el acceso puede suspenderse después de avisarte. Los datos no se borran por eso.</li>
        </ul>
      </Section>
      <Section title="10. Tus datos son tuyos">
        <p>Los datos que el cliente carga en el sistema son del cliente (y de sus clientes y empleados, según la ley). Podés pedirnos una copia en cualquier momento, también al darte de baja. Cómo los cuidamos está explicado en la <Link to="/legal/privacidad">Política de privacidad</Link>.</p>
      </Section>
      <Section title="11. Disponibilidad">
        <p>Trabajamos para que el sistema esté disponible todo el tiempo y hacemos copias de seguridad, pero no podemos garantizar que nunca haya cortes. Conviene tener un plan de respaldo (por ejemplo, la agenda impresa del día) ante una interrupción.</p>
      </Section>
      <Section title="12. Responsabilidad">
        <p>{APP_BRAND} responde por el funcionamiento del sistema dentro de lo razonable. No responde por datos mal cargados, por decisiones comerciales o de salud tomadas con esos datos, ni por el uso del sistema fuera de estas condiciones. La relación con los clientes, empleados y proveedores es del local.</p>
      </Section>
      <Section title="13. Cambios y ley aplicable">
        <p>Podemos mejorar el sistema y actualizar estas condiciones. Si el cambio es importante, te avisamos antes. Estas condiciones se rigen por las leyes de la República Argentina.</p>
      </Section>
      <Section title="14. Contacto"><Contact /></Section>
    </>
  );
}

function Privacidad() {
  return (
    <>
      <p className="lg-lead">
        Acá te contamos qué datos personales se guardan en {APP_NAME}, para qué se usan y qué derechos tenés, según la Ley 25.326 de Protección de Datos Personales.
      </p>
      <Section title="1. Quién es responsable de los datos">
        <ul>
          <li>El <b>local</b> que usa {APP_NAME} es el responsable de su base de datos: decide qué datos carga y para qué.</li>
          <li><b>{APP_BRAND}</b> presta el software y guarda esos datos por cuenta del local. No los usa para otra cosa.</li>
        </ul>
      </Section>
      <Section title="2. Qué datos se guardan y para qué">
        <ul>
          <li><b>Clientes:</b> nombre, teléfono, email, cumpleaños y, si el local lo necesita, DNI. Sirven para dar turnos y avisarte (confirmación, recordatorio, reseña).</li>
          <li><b>Turnos:</b> servicios, profesional, fecha y hora, seña y las observaciones que quieras dejar.</li>
          <li><b>Empleados y usuarios:</b> nombre, email, rol y los datos necesarios para agenda y comisiones.</li>
          <li><b>Uso del sistema:</b> se registra quién hace acciones sensibles (anulaciones, descuentos, ver una ficha de salud) para cuidar la operación del local.</li>
        </ul>
      </Section>
      <Section title="3. Datos de salud, fichas y consentimientos">
        <p>Las alergias, contraindicaciones, tests de parche, antecedentes y fórmulas que el local registre son <b>datos sensibles</b> (Ley 25.326): se guardan solo con tu consentimiento, se usan para atenderte de forma segura y no se usan para publicidad. El personal de recepción ve solo una alerta; el detalle lo ven el profesional que te atiende y el encargado. En tatuajes y piercing, el consentimiento firmado se conserva el plazo que exige la normativa, aunque pidas borrar tus datos.</p>
      </Section>
      <Section title="4. Fotos">
        <p>Las fotos de antes y después se guardan por turno y solo se usan con tu consentimiento, que se pide <b>por finalidad</b>: registro interno, mostrártelas a vos o portfolio público. Podés retirar el consentimiento cuando quieras.</p>
      </Section>
      <Section title="5. Si reservás por la web">
        <p>Te pedimos nombre, teléfono y lo necesario para tu turno. Esos datos los recibe el local que elegiste, solo para gestionarlo. Si pagás una seña online, el pago se hace en Mercado Pago: {APP_NAME} no ve ni guarda los datos de tu tarjeta. Para ver, cancelar o reprogramar tu turno usás un enlace con un código único, sin crear cuenta; ese enlace vence a los 90 días del turno.</p>
      </Section>
      <Section title="6. No se venden ni se ceden">
        <p>Los datos no se venden, no se alquilan y no se entregan a terceros para publicidad. Solo se comparten cuando lo exige la ley o una orden judicial, o con los proveedores técnicos necesarios para que el sistema funcione (alojamiento y, si el local lo activa, Mercado Pago), que están obligados a mantener la confidencialidad. {APP_NAME} no envía mensajes por su cuenta: los avisos los hace el local.</p>
      </Section>
      <Section title="7. Tus derechos">
        <p>Podés pedir <b>acceso</b> a tus datos, que se <b>rectifiquen</b> o <b>actualicen</b> si están mal, y que se <b>supriman</b> cuando corresponda. El pedido se hace ante el local, que es el responsable de la base. Si no sabés a quién dirigirte, escribinos y te orientamos.</p>
      </Section>
      <Section title="8. Seguridad y cookies">
        <p>Las contraseñas y los PIN se guardan cifrados, la conexión es segura (https), cada local ve solo sus propios datos, las acciones sensibles quedan registradas y se hacen copias de seguridad. {APP_NAME} no usa cookies de publicidad ni rastreadores de terceros: solo guarda en tu navegador lo necesario para tu sesión y tu preferencia de modo claro u oscuro.</p>
      </Section>
      <Section title="9. Órgano de control">
        <p className="lg-quote">La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.</p>
      </Section>
      <Section title="10. Contacto"><Contact /></Section>
    </>
  );
}

function Baja() {
  return (
    <>
      <p className="lg-lead">
        Podés dar de baja un servicio contratado a distancia o arrepentirte de la contratación, de forma simple y sin registro previo, como lo establece la Disposición 954/2025 de la Subsecretaría de Defensa del Consumidor y Lealtad Comercial (Ministerio de Economía).
      </p>
      <Section title="1. Si sos cliente de un local que usa Turnia">
        <ul>
          <li>En la página de turnos online del local (y en su vitrina) encontrás los botones <b>«Botón de arrepentimiento»</b> y <b>«Botón de baja»</b>.</li>
          <li>Completás tu nombre y un contacto, sin crear cuenta. Al instante recibís una <b>constancia con fecha, hora y código</b>.</li>
          <li>El local tiene <b>24 horas</b> para responderte con un código de gestión. Si pagaste una seña online, el local define cómo se devuelve según su política publicada; si te arrepentís dentro de los plazos legales, la seña se devuelve.</li>
          <li>Los servicios que ya se prestaron (un corte, un tatuaje realizado) no pueden devolverse.</li>
        </ul>
      </Section>
      <Section title="2. Si sos un local que usa Turnia">
        <ul>
          <li>En Configuración y en el menú tenés el botón <b>«Dar de baja el servicio»</b>: lo confirmás en dos pasos y te da al instante una constancia <b>BAJA-SRV-AAAA-NNNN</b> con fecha y hora. El sistema sigue funcionando hasta el final del período ya pagado, no se hacen cobros nuevos y tus datos se conservan; podés retirar la baja antes de esa fecha. Si no podés ingresar, usá el botón de la pantalla de ingreso y {APP_BRAND} te responde dentro de las 24 horas.</li>
          <li>Antes de la baja podés pedir una copia de tus datos.</li>
        </ul>
      </Section>
      <Section title="3. Contacto"><Contact /></Section>
    </>
  );
}

const DOCS = {
  terminos: { title: "Términos y condiciones", other: "privacidad", otherLabel: "Política de privacidad", Body: Terminos },
  privacidad: { title: "Política de privacidad", other: "terminos", otherLabel: "Términos y condiciones", Body: Privacidad },
  baja: { title: "Baja y arrepentimiento", other: "terminos", otherLabel: "Términos y condiciones", Body: Baja },
} as const;

function Legal({ doc }: { doc: keyof typeof DOCS }) {
  useLightPage();
  const d = DOCS[doc];
  useEffect(() => { document.title = `${d.title} · ${APP_NAME}`; window.scrollTo(0, 0); }, [d.title]);
  return (
    <div className="pb-page lg-page">
      <header className="lg-top">
        <div className="lg-wrap lg-top-row">
          <span className="lg-brand"><TurniaLogo size={34} /><strong>{APP_NAME}</strong></span>
          <button type="button" className="lg-back" onClick={() => (window.history.length > 1 ? window.history.back() : window.location.assign("/"))}>‹ Volver</button>
        </div>
      </header>
      <main className="lg-wrap">
        <article className="pb-card lg-card">
          <span className="pb-step-label">Legales</span>
          <h1>{d.title}</h1>
          <p className="lg-updated">Última actualización: {UPDATED}</p>
          <d.Body />
          <p className="lg-also">Leé también: <Link to={`/legal/${d.other}`}>{d.otherLabel}</Link></p>
        </article>
      </main>
      <footer className="pb-foot"><PoweredBy /></footer>
    </div>
  );
}

export default Legal;
