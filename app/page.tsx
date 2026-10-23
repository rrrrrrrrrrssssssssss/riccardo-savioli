import Bio from "@/components/Bio";
import { getBlocks } from "@/lib/content";

export default function Home() {
  return <Bio blocks={getBlocks()} />;
}
