import Link from "next/link";
import { Suspense } from "react";
import { DesktopNav, MobileTabBar } from "@/components/app-nav";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { OfflineDataSync } from "@/components/pwa/offline-data-sync";
import { TimezoneSync } from "@/components/timezone-sync";
import { getCurrentUser } from "@/lib/session";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <OfflineBanner />
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-5">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            KeepTrack
          </Link>
          <DesktopNav />
        </div>
      </header>

      {/* Bottom padding clears the mobile tab bar. */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-6 pb-28 md:pb-12">
        {children}
      </main>

      <MobileTabBar />

      <Suspense fallback={null}>
        <SessionBootstrap />
        <OfflineDataSync />
      </Suspense>
    </div>
  );
}

/** Per-session side effects that need the browser (timezone detection). */
async function SessionBootstrap() {
  const user = await getCurrentUser();
  return <TimezoneSync needed={!user.timezoneDetected} />;
}
