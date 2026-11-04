import type { Metadata } from "next";
import Link from "next/link";
import {
  DATA_DELETION_EMAIL_HREF,
  PRIVACY_EMAIL,
  PRIVACY_PATH,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Eliminación de datos personales | RhinosApp",
  description:
    "Cómo solicitar la eliminación de tus datos personales de RhinosApp y de las conversaciones con su asistente de WhatsApp.",
};

export default function DataDeletionPage() {
  return (
    <>
      <header className="space-y-4">
        <h1>Eliminación de datos personales</h1>
        <p className="text-muted-foreground text-sm">
          Última actualización:{" "}
          <time dateTime="2026-11-04">4 de noviembre de 2026</time>
        </p>
        <p>
          Podés solicitar la eliminación de tus datos personales tratados por
          RhinosApp, incluidos los recibidos a través de WhatsApp Business
          Platform de Meta. No necesitás iniciar sesión ni tener una cuenta
          activa para hacer el pedido.
        </p>
      </header>

      <section aria-labelledby="solicitud">
        <h2 id="solicitud">Cómo enviar la solicitud</h2>
        <ol>
          <li>
            Escribí a <a href={DATA_DELETION_EMAIL_HREF}>{PRIVACY_EMAIL}</a> con
            el asunto “Eliminación de datos personales”.
          </li>
          <li>
            Indicá tu nombre y el correo de tu cuenta o el número de WhatsApp
            con el que te comunicaste, incluido el código de país.
          </li>
          <li>
            Si hablaste con una distribuidora, indicá su nombre. Explicá qué
            datos querés eliminar, por ejemplo, los de tu cuenta o una
            conversación de WhatsApp.
          </li>
        </ol>
        <p>
          Podemos pedir información adicional razonable para verificar tu
          identidad y localizar los registros. No envíes contraseñas, claves de
          acceso ni datos de tarjetas.
        </p>
      </section>

      <section aria-labelledby="gestion">
        <h2 id="gestion">Cómo se gestiona el pedido</h2>
        <p>
          Las solicitudes se gestionan por correo. Si la distribuidora con la
          que te vinculaste es responsable de los datos, canalizamos el pedido
          con esa empresa. También podés contactarla directamente.
        </p>
        <p>
          Las solicitudes de supresión se atienden dentro de los cinco días
          hábiles de recibido el reclamo, conforme a la{" "}
          <a href="https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion">
            Ley 25.326
          </a>
          . Te comunicaremos por correo el resultado de la solicitud y, cuando
          corresponda, los motivos por los que deba conservarse determinada
          información.
        </p>
      </section>

      <section aria-labelledby="alcance">
        <h2 id="alcance">Qué datos abarca la eliminación</h2>
        <p>
          Según el alcance del pedido, puede comprender datos de cuenta y
          contacto, el número de WhatsApp, mensajes, audios y transcripciones, y
          otros registros personales que RhinosApp trate y que puedan
          suprimirse.
        </p>
        <p>
          Podemos conservar la información que resulte necesaria para cumplir
          obligaciones legales, contables o impositivas, o para atender un
          reclamo, limitando su uso a esas finalidades. La baja de una cuenta no
          implica por sí sola la eliminación inmediata de todos los registros.
        </p>
        <p>
          Este procedimiento se refiere a los datos tratados por RhinosApp y por
          las distribuidoras que usan el servicio. No elimina tu cuenta de
          WhatsApp o Facebook ni los mensajes o copias que otras personas
          conserven en sus dispositivos.
        </p>
      </section>

      <section aria-labelledby="comunicaciones">
        <h2 id="comunicaciones">Si querés dejar de recibir mensajes</h2>
        <p>
          Podés solicitarlo a la distribuidora o al mismo correo de contacto,
          indicando el número de WhatsApp y la empresa involucrada. También
          podés bloquear el número desde WhatsApp. Dejar de recibir mensajes y
          pedir la eliminación de los datos son solicitudes diferentes; podés
          hacer ambas.
        </p>
      </section>

      <p>
        Consultá la <Link href={PRIVACY_PATH}>política de privacidad</Link> para
        conocer los datos que tratamos, sus finalidades y tus demás derechos.
      </p>
    </>
  );
}
