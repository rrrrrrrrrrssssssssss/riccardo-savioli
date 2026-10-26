// A project line is a piece of the bio sentence whose clickable part is the project name, e.g.
// "He developed the [Luca A. Caizzi Archive System],". In content/site.json it is one string with
// the name in square brackets; without brackets, everything but a trailing comma is the name.

export type LabelParts = { before: string; name: string; after: string };

export function splitLabel(label: string): LabelParts {
  const bracketed = label.match(/^(.*?)\[(.+)\](.*)$/s);
  if (bracketed) return { before: bracketed[1], name: bracketed[2], after: bracketed[3] };
  const [, name, comma = ""] = label.match(/^(.*?)(,\s*)?$/s) ?? [label, label];
  return { before: "", name, after: comma };
}

// Joins the parts edited in the admin, adding the spaces between words: a space after the text
// before the name, and before the text after it unless that starts with punctuation.
export function joinLabel(parts: LabelParts): string {
  const before = parts.before.trim();
  const name = parts.name.trim();
  const after = parts.after.trim();
  const pre = before ? `${before} ` : "";
  const post = after && /^[\p{L}\p{N}(]/u.test(after) ? ` ${after}` : after;
  // Keep the plain form ("Alessi,") when it reads back the same; brackets only when needed.
  const plain = pre + name + post;
  const read = splitLabel(plain);
  if (read.name === name && read.before.trim() === before && read.after.trim() === after)
    return plain;
  return `${pre}[${name}]${post}`;
}
