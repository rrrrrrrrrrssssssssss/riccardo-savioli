import { NextResponse } from "next/server";
import { uploadBlob } from "@/lib/github";

// Receives one converted photo or video as the raw request body
// (converted in the browser, so it stays under Vercel's 4.5 MB body limit).
export async function POST(req: Request) {
  const data = Buffer.from(await req.arrayBuffer());
  if (!data.length) {
    return NextResponse.json({ error: "File mancante" }, { status: 400 });
  }
  try {
    return NextResponse.json({ sha: await uploadBlob(data.toString("base64")) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
