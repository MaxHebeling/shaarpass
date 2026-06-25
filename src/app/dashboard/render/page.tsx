import { RenderStudio } from "@/components/event-architect/RenderStudio";

export const metadata = { title: "Render IA del recinto | ShaarPass" };

export default function RenderPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold">Render IA del recinto</h1>
        <p className="text-sm text-muted">Carga los datos del lugar y la IA genera una imagen fotorrealista lista para la portada de tu evento.</p>
      </div>
      <RenderStudio />
    </div>
  );
}
