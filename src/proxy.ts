/**
 * Proxy (antes `middleware`, renombrado en Next 16).
 *
 * Es el boundary de autenticación de `/dashboard`: corre delante de la app y
 * redirige a /login a quien no tenga sesión. Por eso está cubierto por pruebas
 * — un fallo aquí es acceso no autorizado, no un bug cosmético.
 *
 * Nota: NO es la única defensa. Las tablas tienen RLS en Supabase, así que un
 * bypass del proxy no basta para leer datos ajenos. Defensa en profundidad.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options as Record<string, unknown>));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Protege /dashboard
  if (request.nextUrl.pathname.startsWith("/dashboard") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
