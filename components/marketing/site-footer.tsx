import Link from "next/link";

/** Public footer: legal pages (Phase 6). */
export function SiteFooter() {
  return (
    <footer className="mt-16 flex flex-wrap gap-x-5 gap-y-2 border-t pt-6 text-sm text-muted-foreground">
      <span>© KeepTrack</span>
      <Link href="/privacy" className="hover:text-foreground hover:underline">
        Privacy
      </Link>
      <Link href="/terms" className="hover:text-foreground hover:underline">
        Terms
      </Link>
    </footer>
  );
}
