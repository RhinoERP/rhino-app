import type { Metadata } from "next";
import Link from "next/link";
import {
  DATA_DELETION_PATH,
  PRIVACY_EMAIL,
  PRIVACY_EMAIL_HREF,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de privacidad | RhinosApp",
  description:
    "Cómo RhinosApp trata los datos personales de su plataforma y asistente de WhatsApp, y cómo ejercer tus derechos.",
};

export default function PrivacyPage() {
  return (
    <>
      <header className="space-y-4">
        <h1>Política de privacidad</h1>
        <p className="text-muted-foreground text-sm">
          Última actualización:{" "}
          <time dateTime="2026-11-04">4 de noviembre de 2026</time>
        </p>
        <p>
          Esta política explica cómo tratamos los datos personales al usar
          RhinosApp, nuestra plataforma de gestión comercial para distribuidoras
          de alimentos, y sus canales de atención, incluido el asistente de
          WhatsApp. También indica cómo consultar, corregir o solicitar la
          eliminación de tus datos.
        </p>
      </header>

      <section aria-labelledby="responsable">
        <h2 id="responsable">1. Quién trata tus datos</h2>
        <p>
          RhinosApp es operada por <strong>RhinosApp SRL</strong>, CUIT
          30-71940015-5, con domicilio legal en Ortega y Gasset 1945 7B, Ciudad
          Autónoma de Buenos Aires, República Argentina. Para consultas de
          privacidad podés escribir a{" "}
          <a href={PRIVACY_EMAIL_HREF}>{PRIVACY_EMAIL}</a>.
        </p>
        <p>
          RhinosApp es responsable de los datos que trata para administrar su
          relación con las empresas que contratan la plataforma y brindar el
          servicio. Cuando una distribuidora gestiona datos de sus clientes,
          vendedores o contactos, esa empresa es responsable de esos datos y
          RhinosApp actúa como encargado del tratamiento, por su cuenta y según
          sus instrucciones. Podés dirigir las consultas a la distribuidora o a
          RhinosApp, que las canalizará con la empresa correspondiente.
        </p>
      </section>

      <section aria-labelledby="datos">
        <h2 id="datos">2. Qué datos recopilamos</h2>
        <ul>
          <li>
            <strong>Cuenta y contacto:</strong> nombre, razón social, CUIT,
            correo, teléfono, domicilio y datos de los usuarios de la
            plataforma.
          </li>
          <li>
            <strong>Clientes de las distribuidoras:</strong> nombre o razón
            social, teléfono, dirección de entrega, condiciones comerciales y
            datos necesarios para facturar y cobrar.
          </li>
          <li>
            <strong>WhatsApp:</strong> número de teléfono, datos de perfil
            disponibles, mensajes enviados y recibidos, referencias a archivos
            compartidos, audios y sus transcripciones cuando la función está
            habilitada, fechas y estados de entrega.
          </li>
          <li>
            <strong>Actividad comercial:</strong> consultas, productos
            solicitados, pedidos, presupuestos, historial de compras, pagos y
            saldos.
          </li>
          <li>
            <strong>Información técnica:</strong> dirección IP, dispositivo,
            navegador, registros de acceso y uso, y errores del servicio.
          </li>
        </ul>
        <p>
          Recibimos estos datos de vos, de la empresa con la que te vinculás y
          de las integraciones que esa empresa habilita. No solicitamos datos
          sensibles, como información de salud, religión u opiniones políticas;
          evitá enviarlos por WhatsApp.
        </p>
      </section>

      <section aria-labelledby="finalidades">
        <h2 id="finalidades">3. Para qué usamos los datos</h2>
        <p>
          Usamos la información para prestar el servicio contratado, administrar
          cuentas y accesos, responder consultas, gestionar pedidos, entregas y
          cobranzas, mantener el historial comercial y generar reportes y
          recomendaciones de venta para la distribuidora. También la usamos para
          enviar comunicaciones relacionadas con el servicio, brindar soporte,
          detectar errores, proteger la plataforma y cumplir obligaciones
          legales, contables e impositivas.
        </p>
        <p>
          No vendemos ni alquilamos datos personales ni los usamos para
          publicidad de terceros. El tratamiento se realiza para gestionar la
          relación contractual o comercial, cumplir obligaciones legales y,
          cuando corresponda, con el consentimiento requerido.
        </p>
      </section>

      <section aria-labelledby="whatsapp">
        <h2 id="whatsapp">4. WhatsApp e inteligencia artificial</h2>
        <p>
          Cuando una empresa habilita el asistente de WhatsApp, procesamos los
          mensajes y el contexto comercial necesario, como catálogo, precios,
          stock e historial de pedidos, para generar respuestas automáticas. Si
          la transcripción está habilitada, los audios también se procesan para
          convertirlos en texto.
        </p>
        <p>
          Para estas funciones transmitimos la información necesaria a la API de
          OpenAI. Según su{" "}
          <a href="https://developers.openai.com/api/docs/guides/your-data">
            documentación sobre tratamiento de datos
          </a>
          , los datos enviados a la API no se usan por defecto para entrenar sus
          modelos. Esto no implica ausencia de conservación por parte del
          proveedor, que aplica las condiciones y controles de su servicio.
        </p>
        <p>
          Las respuestas automáticas pueden contener errores. Los pedidos,
          precios y condiciones quedan sujetos a la confirmación de la empresa.
          Las conversaciones pueden ser leídas y respondidas por personal
          autorizado de la distribuidora. Para solicitar atención humana, pedí
          hablar con una persona en el mismo chat.
        </p>
        <p>
          Podés solicitar dejar de recibir comunicaciones contactando a la
          distribuidora o escribiendo a{" "}
          <a href={PRIVACY_EMAIL_HREF}>{PRIVACY_EMAIL}</a>, con el número de
          WhatsApp involucrado y el nombre de la empresa. Las comunicaciones
          deben respetar los permisos y las políticas aplicables de WhatsApp
          Business. Iniciar una conversación no equivale a autorizar publicidad
          indefinida.
        </p>
      </section>

      <section aria-labelledby="proveedores">
        <h2 id="proveedores">5. Proveedores y transferencias de datos</h2>
        <p>
          Para las funciones habilitadas en la plataforma trabajamos con
          proveedores que intervienen en la medida necesaria para prestar el
          servicio:
        </p>
        <ul>
          <li>
            <strong>Meta y WhatsApp Business Platform:</strong> envío y
            recepción de mensajes.
          </li>
          <li>
            <strong>OpenAI:</strong> generación de respuestas y transcripción de
            audios mediante inteligencia artificial.
          </li>
          <li>
            <strong>Supabase:</strong> autenticación, base de datos y
            almacenamiento de archivos.
          </li>
          <li>
            <strong>Vercel:</strong> alojamiento y ejecución de la aplicación
            web.
          </li>
          <li>
            <strong>Resend:</strong> envío de invitaciones y correos
            relacionados con el servicio y la actividad comercial.
          </li>
          <li>
            <strong>Sentry:</strong> monitoreo de errores y funcionamiento del
            servicio, cuando está habilitado.
          </li>
          <li>
            <strong>AfipSDK y ARCA:</strong> integración para emitir y gestionar
            comprobantes fiscales, cuando la empresa habilita esa función.
          </li>
        </ul>
        <p>
          Algunos proveedores pueden procesar información fuera de Argentina.
          Las transferencias que correspondan se sujetan a la Ley 25.326, la
          normativa de la Agencia de Acceso a la Información Pública y las
          garantías de protección aplicables. También podemos comunicar
          información cuando lo exija una ley u orden de una autoridad
          competente.
        </p>
      </section>

      <section aria-labelledby="conservacion">
        <h2 id="conservacion">
          6. Durante cuánto tiempo conservamos los datos
        </h2>
        <p>
          Conservamos los datos durante el tiempo necesario para prestar el
          servicio y cumplir las finalidades de esta política. Para determinar
          ese período tenemos en cuenta la relación con la empresa, la
          naturaleza de la información, las instrucciones de la distribuidora
          cuando actúa como responsable y las obligaciones legales aplicables.
        </p>
        <p>
          La baja de una cuenta no implica la eliminación inmediata de toda la
          información. Los pedidos, comprobantes y registros que deban
          conservarse por obligaciones legales, contables o impositivas, o para
          atender un reclamo, se mantienen durante el plazo que corresponda y
          con su uso limitado a esas finalidades.
        </p>
        <p>
          Cuando los datos dejan de ser necesarios y no existe una obligación
          que justifique conservarlos, corresponde su eliminación o
          anonimización. Podés solicitar la supresión en cualquier momento por
          el canal indicado en esta política. Las solicitudes se gestionan por
          correo y no dependen de contar con una cuenta activa.
        </p>
      </section>

      <section aria-labelledby="seguridad">
        <h2 id="seguridad">7. Seguridad y almacenamiento en tu dispositivo</h2>
        <p>
          Aplicamos controles de acceso por usuario, rol y organización,
          conexiones cifradas y mecanismos de protección de credenciales para
          reducir el riesgo de accesos o usos no autorizados. Ningún sistema
          garantiza seguridad absoluta.
        </p>
        <p>
          La aplicación utiliza cookies y almacenamiento local para funciones
          como mantener la sesión y recordar preferencias. Si usás las funciones
          sin conexión, puede guardar datos comerciales en tu dispositivo para
          permitir su consulta y posterior sincronización. Te recomendamos usar
          dispositivos de confianza y cerrar sesión cuando dejes de utilizarlos.
        </p>
      </section>

      <section aria-labelledby="derechos">
        <h2 id="derechos">8. Tus derechos y la eliminación de datos</h2>
        <p>
          Podés solicitar acceso, rectificación, actualización o supresión de
          tus datos escribiendo a{" "}
          <a href={PRIVACY_EMAIL_HREF}>{PRIVACY_EMAIL}</a> con el asunto “Datos
          personales”. Indicá tu nombre, el correo o número de WhatsApp
          asociado, la distribuidora involucrada si corresponde y qué solicitás.
          Podemos pedir información adicional razonable para verificar tu
          identidad y proteger los datos de otras personas.
        </p>
        <p>
          Los pedidos de acceso se atienden dentro de los diez días corridos y
          los de rectificación, actualización o supresión dentro de los cinco
          días hábiles, conforme a la{" "}
          <a href="https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion">
            Ley 25.326
          </a>
          . Cuando la distribuidora sea responsable de los datos, canalizamos la
          solicitud con esa empresa. Si corresponde conservar determinada
          información por una obligación legal o un reclamo, se limita su uso a
          ese fin.
        </p>
        <p>
          Encontrá el procedimiento en las{" "}
          <Link href={DATA_DELETION_PATH}>
            instrucciones para solicitar la eliminación de datos
          </Link>
          .
        </p>
        <p>
          El titular de los datos personales tiene la facultad de ejercer el
          derecho de acceso a los mismos en forma gratuita a intervalos no
          inferiores a seis meses, salvo que se acredite un interés legítimo al
          efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley
          25.326. La Agencia de Acceso a la Información Pública, en su carácter
          de órgano de control de esa ley, tiene la atribución de atender las
          denuncias y reclamos de quienes resulten afectados en sus derechos por
          incumplimiento de las normas vigentes en materia de protección de
          datos personales. Más información en el sitio de la{" "}
          <a href="https://www.argentina.gob.ar/aaip/datospersonales">
            Agencia de Acceso a la Información Pública
          </a>
          .
        </p>
      </section>

      <section aria-labelledby="menores">
        <h2 id="menores">9. Menores de edad</h2>
        <p>
          RhinosApp es un servicio para empresas y no está dirigido a menores de
          18 años.
        </p>
      </section>

      <section aria-labelledby="cambios">
        <h2 id="cambios">10. Cambios en esta política</h2>
        <p>
          Podemos actualizar esta política para reflejar cambios del servicio o
          de la normativa. La versión vigente estará publicada en esta página,
          con su fecha de actualización. Los cambios relevantes se informarán a
          las empresas clientes por los canales habituales.
        </p>
      </section>
    </>
  );
}
