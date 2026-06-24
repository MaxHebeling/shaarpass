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
  {
    slug: "como-vender-boletos-concierto",
    title: "Cómo vender boletos para un concierto (sin que las comisiones se coman tu ganancia)",
    description:
      "Guía práctica para vender boletos de un concierto en línea: zonas y precios, control de aforo, pagos el mismo día y una comisión baja y transparente.",
    date: "20 de junio de 2026",
    dateISO: "2026-06-20",
    readMins: 5,
    category: "Guías para organizadores",
    body: [
      { type: "p", text: "Organizar un concierto es caro antes de vender el primer boleto: el sonido, el lugar, el artista, la promoción. Por eso cada peso que se va en comisiones se siente, y por eso conviene tener clara la estrategia de venta desde el día uno." },
      { type: "h2", text: "1. Define tus zonas y tus precios" },
      { type: "p", text: "Casi ningún concierto se vende a un solo precio. Lo normal es separar por experiencia: General, Preferente, VIP, y a veces Meet & Greet. No necesitas un mapa de butacas complicado para empezar; basta con crear varios tipos de boleto, cada uno con su precio y su cantidad disponible. Cuando un tipo se agota, deja de venderse solo, sin que tengas que estar pendiente." },
      { type: "p", text: "Un consejo que funciona: pon menos boletos VIP de los que crees. La escasez real (no inventada) hace que la zona premium se venda más rápido y le da sentido al precio." },
      { type: "h2", text: "2. Cobra en línea, no en la puerta" },
      { type: "p", text: "Cobrar en efectivo el día del concierto es una invitación al caos: filas, cambio que no alcanza, y cero datos de quién viene. Vender en línea con anticipación te da flujo de caja para cubrir gastos antes del evento y te dice exactamente cuántos boletos llevas." },
      { type: "p", text: "Aquí es donde importa la comisión. Con ShaarPass es 2% + $0.50 por boleto, y el costo de procesamiento de la tarjeta lo paga quien compra, no tú. Si vendes 500 boletos a $400, eso son $200,000 en venta; la comisión sería 2% ($4,000) más $0.50 por boleto ($250): $4,250. Te quedas con $195,750. Y el dinero te llega el mismo día, no cinco días después." },
      { type: "h2", text: "3. El día del concierto: QR y aforo" },
      { type: "p", text: "Cada asistente llega con su boleto y su código QR único. Tu staff lo escanea desde su propio teléfono en la puerta —sin descargar ninguna app— y el sistema marca quién ya entró. Como el QR es único, la vieja maña de pasar la misma captura entre varios deja de funcionar." },
      { type: "p", text: "Si tienes varias entradas (General, VIP, prensa), puedes poner una persona en cada puerta y todas ven los ingresos sincronizados en tiempo real. Sabes cuánto aforo llevas sin bajar de la cabina a preguntar." },
      { type: "h2", text: "En resumen" },
      { type: "ul", items: [
        "Separa por zonas y limita el VIP para crear escasez real.",
        "Vende en línea con anticipación: flujo de caja y datos.",
        "Cuida la comisión: 2% + $0.50 deja más para producción.",
        "QR único + escaneo desde el celular del staff = cero colados.",
      ] },
      { type: "p", text: "Un concierto bien vendido no es el que llena a cualquier precio, sino el que llena dejándote margen para el siguiente." },
    ],
  },
  {
    slug: "cobrar-entradas-evento-whatsapp",
    title: "Cómo cobrar las entradas de tu evento por WhatsApp",
    description:
      "Si promocionas tus eventos por WhatsApp, así cobras las entradas y entregas el boleto con QR sin pedir transferencias sueltas ni perder el control de quién pagó.",
    date: "21 de junio de 2026",
    dateISO: "2026-06-21",
    readMins: 4,
    category: "Guías para organizadores",
    body: [
      { type: "p", text: "En México y casi toda Latinoamérica, los eventos se mueven por WhatsApp. Ahí promocionas, ahí te preguntan, y ahí —si no tienes cuidado— terminas con un desorden de “ya te mandé la transferencia” y capturas de pantalla que no sabes si son reales." },
      { type: "h2", text: "El problema de cobrar “a mano” por WhatsApp" },
      { type: "p", text: "Pedir transferencias sueltas tiene tres agujeros: no sabes con certeza quién pagó, no tienes un boleto que validar en la puerta, y reconciliar al final es una pesadilla. Además, una captura de transferencia se puede reenviar, igual que un boleto en imagen." },
      { type: "h2", text: "La forma ordenada: un enlace de pago + boleto con QR" },
      { type: "p", text: "La idea es simple: en vez de pedir transferencia, mandas por WhatsApp el enlace de tu evento. La persona compra ahí, le llega su boleto con un código QR único a su correo, y tú lo ves registrado al instante. Sin perseguir a nadie." },
      { type: "p", text: "Con ShaarPass, además, cada boleto trae un botón para reenviarlo por WhatsApp, así que el asistente lo tiene siempre a mano en el chat donde vive todo lo demás. Si el evento es gratis (un servicio, una charla, una reunión), no pagas comisión por emitir esos boletos." },
      { type: "h2", text: "Lo que ganas" },
      { type: "ul", items: [
        "Sabes exactamente quién pagó, sin revisar capturas.",
        "Cada quien recibe su QR único; no se reenvía ni se duplica.",
        "El dinero te llega el mismo día.",
        "En la puerta escaneas el QR desde tu celular, sin listas de papel.",
      ] },
      { type: "p", text: "Sigues vendiendo donde tu gente ya está —WhatsApp— pero con el control de una plataforma seria detrás. Esa es la diferencia entre “juntar dinero” y organizar un evento." },
    ],
  },
  {
    slug: "como-hacer-check-in-evento-codigo-qr",
    title: "Cómo hacer el check-in de tu evento con código QR (y que no se cuele nadie)",
    description:
      "Control de acceso en la puerta sin listas de papel: escanea el QR desde el celular de tu staff, evita boletos duplicados y mira los ingresos en tiempo real.",
    date: "22 de junio de 2026",
    dateISO: "2026-06-22",
    readMins: 5,
    category: "Guías para organizadores",
    body: [
      { type: "p", text: "Vendiste todos los boletos. Felicidades. Ahora viene la parte que arruina eventos buenos: la puerta. Una fila lenta, una lista impresa que nadie encuentra, y la duda eterna de si esa persona ya entró o apenas va llegando." },
      { type: "h2", text: "Por qué la lista de papel ya no alcanza" },
      { type: "p", text: "La hoja impresa tiene tres problemas: es lenta de buscar, no detecta boletos repetidos, y solo una persona puede usarla a la vez. En un evento de cientos de personas, eso se traduce en fila en la entrada y en gente colándose con la misma captura de pantalla." },
      { type: "h2", text: "El check-in con QR, explicado simple" },
      { type: "p", text: "Cada boleto que vendes tiene un código QR único. El día del evento, tu personal abre un enlace en su teléfono y escanea el QR de cada asistente. En verde: bienvenido. En amarillo: este boleto ya fue usado. En rojo: no es válido. Tres colores, cero confusión." },
      { type: "p", text: "Con ShaarPass no necesitas descargar ninguna app ni compartir tu cuenta de administrador. Le mandas a cada persona del staff un enlace seguro propio; cuando termina el evento, lo revocas y listo." },
      { type: "h2", text: "Varias puertas, todo sincronizado" },
      { type: "p", text: "Si tienes Puerta Norte, Puerta Sur y un acceso VIP, pones a alguien en cada una con su propio enlace. Todos escanean al mismo tiempo y los ingresos se sincronizan en tiempo real: si un boleto se escaneó en una puerta, en las demás aparece como usado al instante. Y si en algún punto se cae el internet, los escaneos se guardan en el teléfono y se sincronizan solos cuando vuelve la señal." },
      { type: "h2", text: "Lo que ves desde tu lado" },
      { type: "ul", items: [
        "Cuántos entraron, cuántos faltan y el porcentaje de aforo.",
        "Ingresos por hora y por puerta.",
        "Quién de tu staff está escaneando y su actividad.",
      ] },
      { type: "p", text: "El control de acceso no es un lujo de estadios. Es lo que separa una entrada profesional de un cuello de botella en la puerta —y existe la misma herramienta lo mismo para una conferencia de 80 personas que para un concierto de 8,000." },
    ],
  },
];

export function allPosts(): Post[] {
  return POSTS;
}
export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
