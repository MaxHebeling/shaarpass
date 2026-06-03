/** Datos del FAQ (módulo plano, sin "use client"): lo usa el componente cliente
 *  FAQ.tsx y también el server component del home para emitir FAQPage JSON-LD. */
export const faqs = [
  {
    q: "¿Cuánto cobra ShaarPass?",
    a: "Nuestra comisión es 2% + $0.50 por boleto, más el costo de procesamiento de pago (la tarifa de tu pasarela). Lo ves todo desglosado antes de publicar y el comprador lo ve antes de pagar. Cero cargos ocultos. Los eventos gratuitos no pagan comisión.",
  },
  {
    q: "¿Cuándo recibo mi dinero?",
    a: "El dinero de tus ventas llega a tu propia cuenta de Stripe el mismo día, no semanas después del evento. No retenemos un porcentaje de tus ventas.",
  },
  {
    q: "¿Necesito conocimientos técnicos?",
    a: "No. Creas tu cuenta, conectas tu cuenta de cobro una sola vez y publicas tu evento en minutos. Si quieres, te ayudamos a montar tu primer evento.",
  },
  {
    q: "¿Cómo evitan la reventa y los boletos falsos?",
    a: "Cada boleto tiene un QR seguro que rota cada 15 segundos, imposible de clonar o capturar. La reventa entre fans está topada al precio original: nada de scalping.",
  },
  {
    q: "¿Sirve para eventos grandes con mucha demanda?",
    a: "Sí. Tenemos cola virtual para onsales masivos, límites de compra por persona, anti-bot y mapas de recinto para estadios de 50,000+ asientos.",
  },
  {
    q: "¿Y si tengo un problema el día del evento?",
    a: "Hablas con una persona real, no con un bot. El check-in funciona desde el teléfono e incluso sin internet, sincronizando al reconectar.",
  },
];
