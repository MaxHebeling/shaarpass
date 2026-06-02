import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Política de Reembolsos — ShaarPass",
  description: "Cómo funcionan los reembolsos y cancelaciones en ShaarPass.",
  alternates: { canonical: "/reembolsos" },
};

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-xl font-semibold text-fg">{children}</h2>
);

export default function ReembolsosPage() {
  return (
    <LegalLayout title="Política de Reembolsos" updated="2 de junio de 2026">
      <p>
        ShaarPass es un intermediario tecnológico. La política de reembolsos de cada evento la define{" "}
        <strong className="text-fg">el organizador</strong>, que es quien recibe el pago. Esta política describe el
        marco general.
      </p>

      <div className="space-y-3"><H>1. Reembolsos a criterio del organizador</H>
        <p>
          Salvo que el organizador indique lo contrario, las ventas son finales. El organizador puede autorizar
          reembolsos totales o parciales desde su panel. Si tienes un problema con tu compra, contacta primero al
          organizador del evento.
        </p>
      </div>

      <div className="space-y-3"><H>2. Cancelación o cambio del evento</H>
        <p>
          Si el organizador <strong className="text-fg">cancela</strong> un evento, podrá emitir reembolsos a los
          compradores desde la Plataforma. Los cambios de fecha o sede son responsabilidad del organizador, así como
          informarlos a sus compradores.
        </p>
      </div>

      <div className="space-y-3"><H>3. Cómo se procesan</H>
        <p>
          Los reembolsos se realizan al mismo método de pago original, a través de Stripe, y pueden tardar varios
          días hábiles en reflejarse según tu banco. La comisión de procesamiento de pago puede no ser reembolsable,
          conforme a las reglas de la pasarela.
        </p>
      </div>

      <div className="space-y-3"><H>4. Reventa</H>
        <p>
          Los boletos adquiridos en reventa entre fans se rigen por la misma política del evento. Al revender tu
          boleto, este se reemite al nuevo comprador y el tuyo queda invalidado.
        </p>
      </div>

      <div className="space-y-3"><H>5. Contacto</H>
        <p>
          Para dudas sobre un reembolso que no puedas resolver con el organizador, escríbenos a{" "}
          <a href="mailto:hola@shaarpass.io" className="brand-text">hola@shaarpass.io</a>. Consulta también nuestros{" "}
          <Link href="/terminos" className="brand-text">Términos</Link>.
        </p>
      </div>
    </LegalLayout>
  );
}
