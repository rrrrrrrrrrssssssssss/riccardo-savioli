import { NextResponse } from "next/server";
import { uploadBlob } from "@/lib/github";

// Receives one photo (already resized to JPEG in the browser, so it stays under Vercel's 4.5 MB body limit).
export async function POST(req: Request) {
  const { data } = (await req.json()) as { data: string };
  if (typeof data !== "string" || !data) {
    return NextResponse.json({ error: "Foto mancante" }, { status: 400 });
  }
  try {
    return NextResponse.json({ sha: await uploadBlob(data) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
