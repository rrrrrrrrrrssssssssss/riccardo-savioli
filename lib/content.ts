import site from "@/content/site.json";

// A carousel item: a photo, or a silent looping video when `video` is true.
export type Image = { src: string; width: number; height: number; video?: boolean };

export type Project = { caption: string; images: Image[] };

export type Block =
  | { type: "text"; text: string }
  | { type: "project"; slug: string; label: string; project: Project }
  | { type: "contact"; email: string; instagram: string; vat: string };

// Shape of content/site.json, which the admin edits.
export type RawBlock =
  | { type: "text"; text: string }
  | { type: "project"; slug: string; label: string }
  | { type: "contact"; email: string; instagram: string; vat: string };

export type Site = { blocks: RawBlock[]; projects: Record<string, Project> };

const EMPTY: Project = { caption: "", images: [] };

export function getBlocks(): Block[] {
  const { blocks, projects } = site as Site;
  return blocks.map((b) =>
    b.type === "project" ? { ...b, project: projects[b.slug] ?? EMPTY } : b,
  );
}
