import { JevConsistencyReport } from "@/ui/report/JevConsistencyReport";

export const dynamic = "force-static";
export const metadata = { title: "Jev Consistency Report · seo-jev-analyzer" };

export default function Page() {
  return <JevConsistencyReport />;
}
