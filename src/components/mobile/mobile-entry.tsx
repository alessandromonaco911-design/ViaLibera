"use client";

import type { ReactNode } from "react";
import type { PracticeTopicSummary } from "@/lib/practice/types";
import { MobileHub } from "./mobile-hub";
import type { MobileSection } from "./mobile-view-state";
import { useMobileLayout } from "./use-mobile-layout";
import { PageSkeleton } from "@/components/ui/page-skeleton";

/** Desktop remains server-rendered; only one interactive layout is mounted after hydration. */
export function MobileEntry({ children, initialSection, topics, initialTopicId }: {
  children: ReactNode; initialSection: MobileSection; topics?: PracticeTopicSummary[]; initialTopicId?: string;
}) {
  const mobile = useMobileLayout();
  if (mobile) return <MobileHub initialSection={initialSection} initialTopics={topics} initialTopicId={initialTopicId} />;
  return <><div className="mobile-entry-desktop">{children}</div><div className="mobile-entry-loading"><PageSkeleton /></div></>;
}
