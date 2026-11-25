"use client";

import { LayoutDashboardIcon, PlusIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/add", label: "Add", icon: PlusIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

type IsActive = (href: string) => boolean;
const noneActive: IsActive = () => false;

/**
 * The pathname is request data on dynamic routes, so each nav renders a static
 * fallback (nothing highlighted) and streams in the highlighted version.
 */
function WithActivePath({
  render,
}: {
  render: (isActive: IsActive) => React.ReactNode;
}) {
  return (
    <Suspense fallback={render(noneActive)}>
      <ActivePath render={render} />
    </Suspense>
  );
}

function ActivePath({
  render,
}: {
  render: (isActive: IsActive) => React.ReactNode;
}) {
  const pathname = usePathname();
  return render((href) => pathname === href || pathname.startsWith(`${href}/`));
}

/** Top nav links, shown from the `md` breakpoint up. */
export function DesktopNav() {
  return (
    <WithActivePath
      render={(isActive) => <DesktopLinks isActive={isActive} />}
    />
  );
}

function DesktopLinks({ isActive }: { isActive: IsActive }) {
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            isActive(href)
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Thumb-reachable bottom tab bar on small screens. */
export function MobileTabBar() {
  return (
    <WithActivePath render={(isActive) => <MobileTabs isActive={isActive} />} />
  );
}

function MobileTabs({ isActive }: { isActive: IsActive }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden"
    >
      <ul className="grid grid-cols-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon aria-hidden className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
