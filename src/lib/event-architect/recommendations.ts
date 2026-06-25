import type { Metrics, VenueObject, Recommendation, Level } from "./types";

const idx = (n: number): Level => (n >= 80 ? "excelente" : n >= 60 ? "bueno" : n >= 40 ? "mejorable" : "critico");

export function buildRecommendations(m: Metrics, objects: VenueObject[]): Recommendation[] {
  const recs: Recommendation[] = [];
  recs.push({ id: "vis", title: `Visibilidad ${m.visibility}%`, level: idx(m.visibility), detail: m.visibility >= 70 ? "Buena línea de visión al escenario." : "Acerca el escenario o agrega pantallas LED para mejorar la visibilidad." });
  recs.push({ id: "circ", title: `Circulación ${m.circulation}%`, level: idx(m.circulation), detail: m.circulation >= 60 ? "Flujo de personas adecuado." : "Agrega pasillos y/o accesos para reducir embotellamientos." });
  recs.push({ id: "comf", title: `Comodidad ${m.comfort}%`, level: idx(m.comfort), detail: m.pctOccupied > 70 ? "Ocupación alta: considera reducir densidad." : "Espaciado cómodo entre zonas." });

  if (m.exits < 2) recs.push({ id: "exits", title: "Revisar salidas", level: "critico", detail: "Se recomiendan al menos 2 salidas de emergencia." });
  else recs.push({ id: "exits", title: "Salidas suficientes", level: "bueno", detail: `${m.exits} salidas · evacuación estimada ${m.evacMin} min.` });

  if (m.capacity > 1000 && m.accesses < 3) recs.push({ id: "reg", title: "Más accesos/registro", level: "mejorable", detail: "Con más de 1,000 personas conviene 3+ accesos y varias mesas de registro." });
  if (m.capacity > 500 && !objects.some((o) => o.type === "bathroom")) recs.push({ id: "bath", title: "Agregar baños", level: "mejorable", detail: "La capacidad supera 500: agrega baños." });
  if (m.pctOccupied > 80) recs.push({ id: "dens", title: "Ocupación crítica", level: "critico", detail: "Reduce sillas o amplía el recinto; la ocupación supera el 80%." });

  const bigBlock = objects.find((o) => o.type === "chairBlock" && (o.metadata?.rows ?? 0) > 20);
  if (bigBlock) recs.push({ id: "aisle", title: "Bloques muy grandes", level: "mejorable", detail: "Agrega pasillos: hay bloques de sillas con más de 20 filas." });

  return recs;
}
