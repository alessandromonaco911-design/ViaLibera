import { MobileEntry } from "@/components/mobile/mobile-entry";
import { DesktopProgress } from "@/components/progress/desktop-progress";
import { SiteHeader } from "@/components/ui/site-header";
import { getImportedCatalogId } from "@/lib/exam/generator";
import { listPracticeTopics } from "@/lib/practice/generator";

export const dynamic = "force-dynamic";
export const metadata = { title: "I tuoi progressi" };
export default async function ProgressPage() {
  const catalog = await getImportedCatalogId();
  const topics = catalog ? await listPracticeTopics(catalog) : [];
  return <MobileEntry initialSection="progress" topics={topics}><div><SiteHeader mode="Progressi"/><main><DesktopProgress topics={topics}/></main></div></MobileEntry>;
}
