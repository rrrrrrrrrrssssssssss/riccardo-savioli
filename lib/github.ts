// The admin stores content and photos in the GitHub repo itself:
// every save is one commit, which Vercel then deploys.
import type { Site } from "@/lib/content";

export const REPO = "rrrrrrrrrrssssssssss/riccardo-savioli";
export const BRANCH = process.env.GITHUB_BRANCH ?? "main"; // overridable to test the admin on a branch
export const CONTENT_PATH = "content/site.json";

async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN non configurato");
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// Latest content on main, plus the commit it was read from (photos are previewed at that commit).
export async function readSite() {
  const ref = await gh<{ object: { sha: string } }>(`/git/ref/heads/${BRANCH}`);
  const sha = ref.object.sha;
  const file = await gh<{ content: string }>(`/contents/${CONTENT_PATH}?ref=${sha}`);
  const site = JSON.parse(Buffer.from(file.content, "base64").toString("utf8")) as Site;
  return { site, sha };
}

// Uploads a photo as a git blob; it only becomes part of the repo when a save references it.
export async function uploadBlob(base64: string) {
  const blob = await gh<{ sha: string }>("/git/blobs", {
    method: "POST",
    body: JSON.stringify({ content: base64, encoding: "base64" }),
  });
  return blob.sha;
}

// One commit: new site.json, newly uploaded photos (by blob sha) and removed photos.
export class StaleContentError extends Error {}

// Version of site.json at a commit (its blob id), to tell whether it changed in between.
async function contentVersion(commit: string) {
  const file = await gh<{ sha: string }>(`/contents/${CONTENT_PATH}?ref=${commit}`);
  return file.sha;
}

export async function commitSite(
  site: Site,
  added: { path: string; sha: string }[],
  removed: string[],
  message: string,
  baseSha: string,
) {
  const ref = await gh<{ object: { sha: string } }>(`/git/ref/heads/${BRANCH}`);
  // The admin edited the content as of baseSha. If site.json has changed since (another tab,
  // or a direct edit in the repo), saving would silently overwrite that: refuse instead.
  if (
    ref.object.sha !== baseSha &&
    (await contentVersion(ref.object.sha)) !== (await contentVersion(baseSha))
  ) {
    throw new StaleContentError();
  }
  const parent = await gh<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);

  const tree = await gh<{ sha: string }>("/git/trees", {
    method: "POST",
    body: JSON.stringify({
      base_tree: parent.tree.sha,
      tree: [
        {
          path: CONTENT_PATH,
          mode: "100644",
          type: "blob",
          content: JSON.stringify(site, null, 2) + "\n",
        },
        ...added.map(({ path, sha }) => ({ path, mode: "100644", type: "blob", sha })),
        ...removed.map((path) => ({ path, mode: "100644", type: "blob", sha: null })),
      ],
    }),
  });

  const commit = await gh<{ sha: string }>("/git/commits", {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }),
  });
  await gh(`/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });
  return commit.sha;
}
