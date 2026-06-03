/** Contenido del blog (módulo plano). Para publicar un artículo nuevo, agrega
 *  un objeto a `POSTS`. El body es una lista de bloques renderizables. */

export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] };

export interface Post {
  slug: string;
  title: string;
  description: string;
  date: string;     // legible
  dateISO: string;  // ISO para schema
  readMins: number;
  category: string;
  body: Block[];
}

export const POSTS: Post[] = [
  {
    slug: "cobrar-entradas-evento-iglesia-sin-comisiones",
    title: "Cómo cobrar las entradas de tu evento de iglesia sin perder en comisiones",
    description:
      "La forma simple y transparente de cobrar entradas para conferencias, conciertos y cenas de tu ministerio — sin financiar a la plataforma con tu evento.",
    date: "2 de junio de 2026",
    dateISO: "2026-06-02",
    readMins: 4,
    category: "Guías para organizadores",
    body: [
      { type: "p", text: "Casi todas las iglesias que conozco arrancan igual: alguien pone una mesa en la entrada, una caja de zapatos con cambio, y dos voluntarios anotando nombres en una hoja. Funciona, hasta que deja de funcionar. Se cuela gente, se pierde el control de cuántos pagaron, y al final nadie sabe bien cuánto entró." },
      { type: "p", text: "Cuando das el salto a cobrar en línea, aparece la otra sorpresa: la comisión. Y ahí es donde muchos ministerios sienten que están financiando a la plataforma en lugar de a su evento." },
      { type: "p", text: "Vamos a hablar con números, que es lo justo." },
      { type: "h2", text: "Qué te cobra ShaarPass" },
      { type: "p", text: "2% + $0.50 por boleto. Nada escondido. El costo de procesamiento de la tarjeta lo paga quien compra el boleto, no tú." },
      { type: "p", text: "Pongámoslo en un caso real. Tu congregación organiza una cena anual y vende 200 boletos a $250 pesos cada uno. Eso son $50,000 en entradas. La comisión de ShaarPass sería el 2% ($1,000) más $0.50 por boleto ($100). Total: $1,100. Te quedas con $48,900 para el evento." },
      { type: "p", text: "Ahora la parte que más le gusta a los ministerios: si tu evento es gratis (un culto especial, una conferencia sin costo, una vigilia), la comisión es cero. No pagas por emitir boletos gratuitos. Punto." },
      { type: "p", text: "Hay otra cosa que importa más de lo que parece cuando estás organizando: el dinero te llega el mismo día, no cinco días después. Si vas juntando para cubrir el salón o la comida, no tienes que esperar a que “se libere” el pago." },
      { type: "h2", text: "El día del evento se vuelve simple" },
      { type: "p", text: "Cada persona llega con su boleto y su código QR. Lo escaneas en la puerta y listo. El QR es único, así que esa vieja maña de pasar la misma captura de pantalla entre tres personas deja de funcionar. Ves en tu teléfono quién ya entró y quién falta." },
      { type: "h2", text: "Cómo empiezas" },
      { type: "p", text: "Entras a shaarpass.io, creas tu evento, pones el precio (o lo dejas en gratis), y compartes el enlace por el grupo de WhatsApp de la iglesia. Eso es todo. Sin contratos, sin mensualidad." },
      { type: "p", text: "Si tienes una duda específica de tu caso, hay personas reales que contestan. No un bot que te manda a un artículo de ayuda y te deja igual." },
      { type: "p", text: "Tu evento merece que el dinero llegue completo a donde tiene que llegar. Nosotros nos quedamos con lo justo, y ni un peso más." },
    ],
  },

  {
    slug: "cuanto-cobra-eventbrite-mexico",
    title: "¿Cuánto cobra Eventbrite en México? (y cómo pagar menos)",
    description:
      "Te explicamos con números cuánto se queda Eventbrite por cada boleto que vendes en México, y cómo puedes quedarte con más usando una comisión más baja y transparente.",
    date: "2 de junio de 2026",
    dateISO: "2026-06-02",
    readMins: 4,
    category: "Comparativas",
    body: [
      { type: "p", text: "Si vendes boletos en línea, la pregunta no es solo cuánto cuesta tu evento, sino cuánto se queda la plataforma de cada entrada. Y en eso, no todas cobran igual." },
      { type: "h2", text: "Cómo cobra Eventbrite" },
      { type: "p", text: "Según su propia página de precios, Eventbrite cobra alrededor de 6.99% + IVA por boleto pagado en México, más el procesamiento del pago. Los eventos gratuitos no pagan. Suena pequeño escrito así, pero conviene verlo en pesos." },
      { type: "h2", text: "Qué significa en pesos" },
      { type: "p", text: "Imagina que vendes 300 boletos a $350 cada uno: $105,000 en entradas. Con una comisión cercana al 7% más IVA, se van alrededor de $8,500 solo en comisión de plataforma, sin contar el procesamiento. Ese dinero sale de tu evento." },
      { type: "h2", text: "La alternativa: comisión baja y transparente" },
      { type: "p", text: "ShaarPass cobra 2% + $0.50 por boleto, y el costo de procesamiento de la tarjeta lo paga quien compra, no tú. En el mismo evento de 300 boletos a $350, la comisión de ShaarPass sería 2% ($2,100) más $0.50 por boleto ($150): $2,250. La diferencia frente a una comisión de ~7% se queda en tu bolsa, no en la plataforma." },
      { type: "p", text: "Y lo ves todo desglosado antes de publicar. El comprador también lo ve antes de pagar. Sin cargos que aparecen al final." },
      { type: "h2", text: "Eventos gratis, comisión cero" },
      { type: "p", text: "Si tu evento es gratuito, no pagas comisión. Útil para registros, cultos, conferencias sin costo o cualquier cosa donde solo quieres controlar el aforo." },
      { type: "p", text: "Las cifras de Eventbrite aquí son referenciales, tomadas de su página pública de precios y pueden cambiar. Lo importante es el principio: revisa siempre cuánto se queda la plataforma antes de subir tu evento, porque en volumen, esa diferencia es real." },
    ],
  },

  {
    slug: "como-vender-boletos-evento-mexico-guia",
    title: "Cómo vender boletos para tu evento en México: la guía simple",
    description:
      "Una guía directa para vender entradas en línea para conciertos, conferencias y eventos en México: desde definir tus boletos hasta el check-in con QR el día del evento.",
    date: "2 de junio de 2026",
    dateISO: "2026-06-02",
    readMins: 5,
    category: "Guías para organizadores",
    body: [
      { type: "p", text: "Vender boletos en línea no tiene que ser complicado. Si alguna vez has cobrado entradas con transferencias y capturas de pantalla, sabes que el problema no es cobrar: es el desorden, los que se cuelan, y no saber cuánto llevas vendido. Esta es la versión simple de hacerlo bien." },
      { type: "h2", text: "1. Define tu evento y tus boletos" },
      { type: "p", text: "Empieza por lo básico: nombre, fecha, lugar. Luego decide tus tipos de boleto. No te compliques con diez categorías; casi siempre bastan dos o tres (general, VIP, y quizá uno de preventa más barato). Cada tipo lleva su precio y su cantidad disponible." },
      { type: "h2", text: "2. Pon un precio que tenga sentido" },
      { type: "p", text: "El precio correcto vende más que un descuento agresivo. Mira lo que cobra gente que hace eventos parecidos al tuyo, considera tus costos (salón, sonido, invitados) y deja margen. Si dudas, un boleto de preventa más barato te ayuda a medir interés sin rifar el precio final." },
      { type: "h2", text: "3. Cobra en línea y quédate con más" },
      { type: "p", text: "Aquí es donde la comisión importa. Con ShaarPass son 2% + $0.50 por boleto, y el procesamiento de la tarjeta lo paga el comprador. El dinero de tus ventas llega a tu propia cuenta el mismo día, no semanas después. Los eventos gratuitos no pagan comisión." },
      { type: "h2", text: "4. Comparte el enlace donde está tu gente" },
      { type: "p", text: "Tu evento tiene una página y un enlace. Compártelo donde ya te siguen: el grupo de WhatsApp, tu Instagram, el boletín de tu comunidad. No necesitas pagar publicidad para arrancar; necesitas que la gente que ya te conoce pueda comprar en dos toques." },
      { type: "h2", text: "5. El día del evento: check-in con QR" },
      { type: "p", text: "Cada asistente llega con su código QR. Lo escaneas desde el teléfono en la entrada y listo. El QR es único y rota, así que nadie entra dos veces con la misma captura. Ves en vivo quién ya llegó y cuánto vendiste." },
      { type: "p", text: "Eso es todo. Sin contratos, sin mensualidad, sin perder la mitad de tu evento en comisiones. Defines, compartes, cobras y recibes a tu gente." },
    ],
  },

  {
    slug: "como-llenar-tu-evento-vender-mas-boletos",
    title: "Cómo llenar tu evento: ideas que sí venden boletos",
    description:
      "Estrategias prácticas para vender más entradas: aprovechar tu lista, usar preventa, crear urgencia real y facilitar que tu público comparta.",
    date: "2 de junio de 2026",
    dateISO: "2026-06-02",
    readMins: 5,
    category: "Marketing de eventos",
    body: [
      { type: "p", text: "Casi nadie llena un evento por arte de magia ni por pagar mucha publicidad. Se llena por orden: hablarle a la gente correcta, en el momento correcto, con un motivo para comprar hoy y no después. Estas son las palancas que de verdad mueven la venta." },
      { type: "h2", text: "Empieza por tu lista, no por extraños" },
      { type: "p", text: "Tu primera tanda de boletos casi siempre la compra gente que ya te conoce: tu comunidad, tus clientes, tu congregación, tus seguidores. Antes de gastar un peso en anuncios, avísales a ellos primero. Un mensaje personal al grupo de WhatsApp convierte más que cualquier campaña fría." },
      { type: "h2", text: "Usa la preventa para validar" },
      { type: "p", text: "Abre una preventa a precio más bajo por tiempo limitado. Te da dos cosas: dinero temprano para cubrir costos, y una señal real de cuánta gente vendrá. Si la preventa se mueve, vas bien; si no, mejor enterarte ahora que la semana del evento." },
      { type: "h2", text: "Crea urgencia real, sin trucos" },
      { type: "p", text: "La urgencia funciona cuando es verdad. Cupos que de verdad se acaban, precios de preventa que de verdad suben, fechas que de verdad cierran. La gente lo nota cuando inventas escasez, y pierdes confianza. Mejor di la verdad: 'quedan 40 lugares', y que sea cierto." },
      { type: "h2", text: "Haz que sea fácil compartir" },
      { type: "p", text: "Cada persona que compra es un posible promotor. Dale un enlace limpio y una imagen lista para reenviar. Mientras menos pasos para que alguien comparta tu evento con tres amigos, más se llena solo." },
      { type: "h2", text: "El precio correcto vende más que el descuento" },
      { type: "p", text: "Bajar el precio no siempre llena; a veces transmite que el evento no vale. Antes de rematar, prueba comunicar mejor el valor: qué se llevan, por qué vale la pena, qué no se van a querer perder. El descuento es una herramienta, no la estrategia." },
      { type: "p", text: "Y cuida tu margen: si vendes con una comisión baja y transparente, cada boleto que llenas deja más para tu evento. Vender mucho con poca ganancia por boleto es trabajar para la plataforma, no para ti." },
    ],
  },
];

export function allPosts(): Post[] {
  return POSTS;
}
export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
