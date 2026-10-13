import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const text = (c: React.ReactNode): string =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map(text).join("") : (c as any)?.props?.children ? text((c as any).props.children) : "";

export function Markdown({ source }: { source: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <Typography variant="h4" component="h1" sx={{ mb: 3 }}>{children}</Typography>,
        h2: ({ children }) => (
          <Typography variant="h5" component="h2" id={slug(text(children))} sx={{ mt: 5, mb: 1.5, scrollMarginTop: 80 }}>{children}</Typography>
        ),
        h3: ({ children }) => <Typography variant="h6" component="h3" sx={{ mt: 3, mb: 1 }}>{children}</Typography>,
        p: ({ children }) => <Typography variant="body1" sx={{ mb: 2, maxWidth: "72ch" }}>{children}</Typography>,
        a: ({ href, children }) => <Link href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{children}</Link>,
        ul: ({ children }) => <Box component="ul" sx={{ pl: 3, mb: 2, maxWidth: "72ch", "& li": { mb: 0.75 } }}>{children}</Box>,
        ol: ({ children }) => <Box component="ol" sx={{ pl: 3, mb: 2, maxWidth: "72ch", "& li": { mb: 0.75 } }}>{children}</Box>,
        li: ({ children }) => <Typography component="li" variant="body1">{children}</Typography>,
        code: ({ children }) => (
          <Box component="code" sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.9em", px: 0.5, borderRadius: 1, bgcolor: "m3.surfaceVariant" }}>{children}</Box>
        ),
        table: ({ children }) => (
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, borderRadius: 3 }}>
            <Table size="small">{children}</Table>
          </TableContainer>
        ),
        thead: ({ children }) => <TableHead sx={{ bgcolor: "m3.surfaceVariant" }}>{children}</TableHead>,
        tbody: ({ children }) => <TableBody>{children}</TableBody>,
        tr: ({ children }) => <TableRow>{children}</TableRow>,
        th: ({ children }) => <TableCell sx={{ fontWeight: 500, whiteSpace: text(children).length <= 12 ? "nowrap" : undefined }}>{children}</TableCell>,
        td: ({ children }) => <TableCell sx={{ whiteSpace: text(children).length <= 12 ? "nowrap" : undefined }}>{children}</TableCell>,
      }}
    >
      {source}
    </ReactMarkdown>
  );
}
