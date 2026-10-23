import site from "@/content/site.json";

export type Image = { src: string; width: number; height: number };

export type Project = { caption: string; images: Image[] };

export type Block =
  | { type: "text"; text: string }
  | { type: "project"; slug: string; label: string; project: Project }
  | { type: "contact"; email: string; instagram: string; vat: string };

type RawBlock =
  | { type: "text"; text: string }
  | { type: "project"; slug: string; label: string }
  | { type: "contact"; email: string; instagram: string; vat: string };

// Temporary: projects without content get 15 copies of the one available image,
// so every line has a working carousel until the admin is in place.
const PLACEHOLDER: Project = {
  caption: "Project caption placeholder.",
  images: Array(15).fill({ src: "/projects/centolire/01.jpg", width: 2400, height: 1358 }),
};

export function getBlocks(): Block[] {
  const projects = site.projects as Record<string, Project>;
  return (site.blocks as RawBlock[]).map((b) =>
    b.type === "project" ? { ...b, project: projects[b.slug] ?? PLACEHOLDER } : b,
  );
}
