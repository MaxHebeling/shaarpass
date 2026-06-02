import QRCode from "qrcode";

export const runtime = "nodejs";

/** PNG del código QR de un boleto. El token ES la credencial (opaco, único). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token || token.length < 8) {
    return new Response("token inválido", { status: 400 });
  }
  const png = await QRCode.toBuffer(token, {
    width: 360,
    margin: 1,
    color: { dark: "#08080c", light: "#ffffff" },
  });
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
