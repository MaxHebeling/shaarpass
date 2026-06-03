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
];

export function allPosts(): Post[] {
  return POSTS;
}
export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
