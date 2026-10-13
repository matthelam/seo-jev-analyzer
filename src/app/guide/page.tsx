import { readFileSync } from "node:fs";
import { join } from "node:path";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import { Markdown, slug } from "@/ui/Markdown";

export const dynamic = "force-static";
export const metadata = { title: "Guide · seo-jev-analyzer" };

export default function GuidePage() {
  const source = readFileSync(join(process.cwd(), "docs", "guide.md"), "utf8");
  const headings = [...source.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "220px 1fr" }, gap: 4 }}>
      <Box component="nav" aria-label="Contents" sx={{ display: { xs: "none", md: "block" }, position: "sticky", top: 88, alignSelf: "start" }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Contents</Typography>
        {headings.map((h) => (
          <Link key={h} href={`#${slug(h)}`} underline="hover" color="text.secondary" variant="body2" sx={{ display: "block", py: 0.75 }}>
            {h}
          </Link>
        ))}
      </Box>
      <Box component="article" sx={{ minWidth: 0 }}>
        <Markdown source={source} />
      </Box>
    </Box>
  );
}
