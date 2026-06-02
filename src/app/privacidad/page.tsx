import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Política de Privacidad — ShaarPass",
  description: "Cómo ShaarPass recopila, usa y protege tus datos personales.",
  alternates: { canonical: "/privacidad" },
};

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-xl font-semibold text-fg">{children}</h2>
);

export default function PrivacidadPage() {
  return (
    <LegalLayout title="Política de Privacidad" updated="2 de junio de 2026">
      <p>
        En ShaarPass respetamos tu privacidad. Esta política explica qué datos personales tratamos, con qué fin y
        cuáles son tus derechos. Es el aviso de privacidad de la Plataforma (www.shaarpass.io).
      </p>

      <div className="space-y-3"><H>1. Datos que recopilamos</H>
        <ul className="list-disc space-y-1 pl-6">
          <li><strong className="text-fg">De organizadores:</strong> nombre, correo, datos de tu organización y de tus eventos.</li>
          <li><strong className="text-fg">De compradores:</strong> correo electrónico y los datos necesarios para emitir tu boleto.</li>
          <li><strong className="text-fg">De pago:</strong> los datos de tarjeta los procesa <strong className="text-fg">Stripe</strong>; ShaarPass NO almacena números de tarjeta.</li>
          <li><strong className="text-fg">Técnicos:</strong> dirección IP y datos de uso, para seguridad y prevención de abuso (límites anti-bot).</li>
        </ul>
      </div>

      <div className="space-y-3"><H>2. Para qué los usamos</H>
        <ul className="list-disc space-y-1 pl-6">
          <li>Operar la Plataforma: crear eventos, procesar compras y emitir boletos con QR.</li>
          <li>Enviar correos transaccionales (tus boletos, confirmaciones).</li>
          <li>Enviar comunicaciones del organizador a sus compradores (puedes darte de baja).</li>
          <li>Prevenir fraude y cumplir obligaciones legales.</li>
        </ul>
      </div>

      <div className="space-y-3"><H>3. Con quién los compartimos</H>
        <p>Compartimos datos solo con los proveedores necesarios para operar:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li><strong className="text-fg">Stripe</strong> — procesamiento de pagos.</li>
          <li><strong className="text-fg">Supabase</strong> — base de datos y autenticación.</li>
          <li><strong className="text-fg">Vercel</strong> — alojamiento de la aplicación.</li>
          <li><strong className="text-fg">Resend</strong> — envío de correos.</li>
          <li>El <strong className="text-fg">organizador</strong> del evento, respecto de sus compradores.</li>
        </ul>
        <p>No vendemos tus datos personales.</p>
      </div>

      <div className="space-y-3"><H>4. Tus derechos (ARCO)</H>
        <p>
          Puedes solicitar el Acceso, Rectificación, Cancelación u Oposición al tratamiento de tus datos, así como
          revocar tu consentimiento, escribiendo a{" "}
          <a href="mailto:tickets@shaarpass.io" className="brand-text">tickets@shaarpass.io</a>. Para dejar de recibir
          correos de marketing, usa el enlace &ldquo;darte de baja&rdquo; al pie de cada correo.
        </p>
      </div>

      <div className="space-y-3"><H>5. Conservación y seguridad</H>
        <p>
          Conservamos tus datos mientras tu cuenta esté activa o sea necesario para prestar el servicio y cumplir la
          ley. Aplicamos medidas de seguridad razonables; los códigos QR de los boletos rotan periódicamente para
          evitar clonaciones.
        </p>
      </div>

      <div className="space-y-3"><H>6. Cookies</H>
        <p>
          Usamos cookies estrictamente necesarias para la sesión y el funcionamiento de la Plataforma (por ejemplo,
          mantener tu sesión iniciada y el carrito de compra).
        </p>
      </div>

      <div className="space-y-3"><H>7. Cambios y contacto</H>
        <p>
          Podemos actualizar este aviso; publicaremos la versión vigente con su fecha. Para cualquier asunto de
          privacidad, contáctanos en <a href="mailto:tickets@shaarpass.io" className="brand-text">tickets@shaarpass.io</a>.
        </p>
      </div>
    </LegalLayout>
  );
}
