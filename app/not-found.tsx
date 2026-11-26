import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto grid w-full max-w-md flex-1 content-center gap-4 px-5 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">
        This page doesn&apos;t exist, or the purchase was deleted.
      </p>
      <Link
        href="/dashboard"
        className={buttonVariants({ className: "justify-self-start" })}
      >
        Go to dashboard
      </Link>
    </main>
  );
}
