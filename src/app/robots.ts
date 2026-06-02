import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // No malgastar crawl budget en privado/transaccional (lección Eventbrite).
        disallow: ["/dashboard", "/api", "/login", "/e/*/checkout", "/e/*/gracias"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
