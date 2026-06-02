import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Términos y Condiciones — ShaarPass",
  description: "Términos y condiciones de uso de ShaarPass, la plataforma de venta de boletos.",
  alternates: { canonical: "/terminos" },
};

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-xl font-semibold text-fg">{children}</h2>
);

export default function TerminosPage() {
  return (
    <LegalLayout title="Términos y Condiciones" updated="2 de junio de 2026">
      <p>
        Estos Términos y Condiciones (&ldquo;Términos&rdquo;) regulan el uso de ShaarPass (&ldquo;la Plataforma&rdquo;,
        &ldquo;nosotros&rdquo;), accesible en www.shaarpass.io. Al crear una cuenta, publicar un evento o comprar un
        boleto, aceptas estos Términos. Si no estás de acuerdo, no uses la Plataforma.
      </p>

      <div className="space-y-3"><H>1. Qué es ShaarPass</H>
        <p>
          ShaarPass es un <strong className="text-fg">intermediario tecnológico</strong> que permite a los
          organizadores crear eventos, vender boletos y gestionar el acceso, y a los compradores adquirir esos boletos.
          <strong className="text-fg"> ShaarPass no es el organizador ni el productor de los eventos</strong> listados
          y no es responsable de su realización, contenido, calidad, cancelación o cambios. El contrato del evento es
          entre el organizador y el comprador.
        </p>
      </div>

      <div className="space-y-3"><H>2. Cuentas</H>
        <p>
          Para vender boletos debes crear una cuenta y proporcionar información veraz. Eres responsable de la
          actividad de tu cuenta y de mantener segura tu contraseña. Puedes registrarte si tienes capacidad legal
          para contratar.
        </p>
      </div>

      <div className="space-y-3"><H>3. Organizadores</H>
        <p>El organizador es el único responsable de:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>La veracidad de la información del evento (fecha, lugar, precios, disponibilidad).</li>
          <li>Cumplir la ley aplicable, obtener permisos y pagar los impuestos que correspondan.</li>
          <li>Atender a sus compradores y honrar los boletos vendidos.</li>
          <li>Su política de reembolsos y la resolución de disputas con sus compradores.</li>
        </ul>
        <p>
          Para recibir pagos, el organizador debe conectar una cuenta de Stripe. Los fondos de las ventas se
          depositan en la cuenta del organizador conforme a los tiempos de Stripe.
        </p>
      </div>

      <div className="space-y-3"><H>4. Comisiones</H>
        <p>
          ShaarPass cobra una comisión por boleto vendido (2% + $0.50 por boleto), más el costo de procesamiento de
          pago de la pasarela, que se muestra de forma transparente antes de comprar. Los eventos gratuitos no pagan
          comisión. Consulta el detalle en <Link href="/precios" className="brand-text">Precios</Link>.
        </p>
      </div>

      <div className="space-y-3"><H>5. Compradores</H>
        <p>
          Al comprar, recibes un boleto con un código QR. Eres responsable de proporcionar un correo válido y de
          resguardar tu boleto. Los reembolsos se rigen por la{" "}
          <Link href="/reembolsos" className="brand-text">Política de Reembolsos</Link> y por la política del organizador.
        </p>
      </div>

      <div className="space-y-3"><H>6. Reventa entre fans</H>
        <p>
          ShaarPass permite la reventa de boletos entre usuarios <strong className="text-fg">topada al precio
          original</strong>; no se permite la reventa por encima del precio de cara. Al revender, el boleto se reemite
          a nombre del nuevo comprador y el anterior queda invalidado.
        </p>
      </div>

      <div className="space-y-3"><H>7. Conducta prohibida</H>
        <ul className="list-disc space-y-1 pl-6">
          <li>Usar bots o medios automatizados para acaparar boletos.</li>
          <li>Publicar eventos fraudulentos, ilegales o que infrinjan derechos de terceros.</li>
          <li>Revender por encima del precio original o fuera de la Plataforma de forma fraudulenta.</li>
          <li>Vulnerar la seguridad de la Plataforma o de los códigos QR.</li>
        </ul>
      </div>

      <div className="space-y-3"><H>8. Propiedad intelectual</H>
        <p>
          La marca, el software y el diseño de ShaarPass son de su titular. El contenido que sube el organizador
          (textos, imágenes, logos) es de su propiedad; al subirlo, nos concede una licencia para mostrarlo en la
          Plataforma con el fin de operar el servicio.
        </p>
      </div>

      <div className="space-y-3"><H>9. Limitación de responsabilidad</H>
        <p>
          La Plataforma se ofrece &ldquo;tal cual&rdquo;. En la medida que la ley lo permita, ShaarPass no será
          responsable por la realización o cancelación de los eventos, ni por daños indirectos. Nuestra
          responsabilidad total se limita a las comisiones que nos hayas pagado por la transacción en cuestión.
        </p>
      </div>

      <div className="space-y-3"><H>10. Suspensión y terminación</H>
        <p>
          Podemos suspender o cancelar cuentas que incumplan estos Términos o la ley, o que representen un riesgo
          de fraude para compradores u organizadores.
        </p>
      </div>

      <div className="space-y-3"><H>11. Cambios</H>
        <p>
          Podemos actualizar estos Términos. Publicaremos la versión vigente con su fecha de actualización. El uso
          continuado de la Plataforma implica la aceptación de los cambios.
        </p>
      </div>

      <div className="space-y-3"><H>12. Ley aplicable y contacto</H>
        <p>
          Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Para cualquier duda escríbenos a{" "}
          <a href="mailto:tickets@shaarpass.io" className="brand-text">tickets@shaarpass.io</a>.
        </p>
      </div>
    </LegalLayout>
  );
}
