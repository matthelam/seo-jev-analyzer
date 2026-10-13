import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Link from "next/link";

export const metadata = { title: "Dashboard · seo-jev-analyzer" };

export default function DashboardPage() {
  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">Dashboard</Typography>
      <Card>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" component="h2" gutterBottom>No profile yet</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: "60ch" }}>
            A profile holds a site's pages, search terms, intent statements, calibration and runs. Profile setup arrives in the next build step; until then, read how the score works.
          </Typography>
          <Button variant="contained" component={Link} href="/guide">Read the Guide</Button>
        </CardContent>
      </Card>
    </Stack>
  );
}
