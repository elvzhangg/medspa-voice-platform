import { notFound } from "next/navigation";

// Landing page is temporarily disabled while the marketing site is being
// redesigned. To restore: `git mv src/app/_disabled-landing/page.tsx.bak
// src/app/page.tsx` (and delete this file). Or just revert the commit that
// introduced this stub.
export default function Page() {
  notFound();
}
