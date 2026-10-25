import type { Metadata } from "next";
import Editor from "@/components/admin/Editor";
import { REPO, readSite } from "@/lib/github";
import "./admin.css";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Admin() {
  try {
    const { site, sha } = await readSite();
    return <Editor initialSite={site} initialSha={sha} repo={REPO} />;
  } catch (e) {
    return (
      <main className="admin">
        <p className="error">Impossibile leggere i contenuti da GitHub: {String(e)}</p>
      </main>
    );
  }
}
