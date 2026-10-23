// Font files are licensed and kept out of this public repo.
// Locally they already sit in Font/; on Vercel they are downloaded
// from the private fonts repo using the FONTS_TOKEN env variable.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const REPO = "rrrrrrrrrrssssssssss/riccardo-savioli-fonts";
const FILES = ["Unica77LL-Regular.woff2", "Unica77LL-RegularItalic.woff2"];

const missing = FILES.filter((f) => !existsSync(`Font/${f}`));
if (missing.length === 0) process.exit(0);

const token = process.env.FONTS_TOKEN;
if (!token) {
  console.error(`Missing fonts (${missing.join(", ")}) and no FONTS_TOKEN set.`);
  process.exit(1);
}

mkdirSync("Font", { recursive: true });
for (const file of missing) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${file}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw" },
  });
  if (!res.ok) {
    console.error(`Could not download ${file}: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  writeFileSync(`Font/${file}`, Buffer.from(await res.arrayBuffer()));
  console.log(`Downloaded ${file}`);
}
