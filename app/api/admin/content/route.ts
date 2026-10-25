import { NextResponse } from "next/server";
import type { Site } from "@/lib/content";
import { commitSite, readSite } from "@/lib/github";

// Photos live in public/projects/<slug>/<file>.jpg and are referenced as /projects/<slug>/<file>.jpg.
const PHOTO = /^public\/projects\/[a-z0-9-]+\/[a-z0-9-]+\.jpg$/;

export async function GET() {
  try {
    return NextResponse.json(await readSite());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { site, added, removed } = (await req.json()) as {
    site: Site;
    added: { path: string; sha: string }[];
    removed: string[];
  };

  if (!Array.isArray(site?.blocks) || typeof site.projects !== "object") {
    return NextResponse.json({ error: "Contenuto non valido" }, { status: 400 });
  }
  if (![...added.map((a) => a.path), ...removed].every((p) => PHOTO.test(p))) {
    return NextResponse.json({ error: "Percorso foto non valido" }, { status: 400 });
  }

  try {
    const sha = await commitSite(site, added, removed, "Update content from admin");
    return NextResponse.json({ sha });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
