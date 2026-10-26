import { NextResponse } from "next/server";
import type { Site } from "@/lib/content";
import { StaleContentError, commitSite, readSite } from "@/lib/github";

// Photos and videos live in public/projects/<slug>/<file>.<ext> and are referenced as /projects/<slug>/<file>.<ext>.
const PHOTO = /^public\/projects\/[a-z0-9-]+\/[a-z0-9-]+\.(jpg|webp|mp4)$/;

export async function GET() {
  try {
    return NextResponse.json(await readSite());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { site, added, removed, baseSha } = (await req.json()) as {
    site: Site;
    baseSha: string;
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
    const sha = await commitSite(site, added, removed, "Update content from admin", baseSha);
    return NextResponse.json({ sha });
  } catch (e) {
    if (e instanceof StaleContentError) {
      return NextResponse.json(
        {
          error:
            "I contenuti sono stati modificati altrove dopo che hai aperto l'admin. Ricarica la pagina e rifai le modifiche.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
