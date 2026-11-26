"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useOffline } from "next/offline";
import { Button, buttonVariants } from "@/components/ui/button";

/** Any failure inside an app page: friendly message + retry (Phase 6 polish). */
export default function AppError({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const offline = useOffline();
  return (
    <div role="alert" className="grid gap-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        {offline ? "You're offline" : "Something went wrong"}
      </h1>
      <p className="text-muted-foreground">
        {offline
          ? "This page needs a connection. It will load again when you're back online."
          : "We couldn't load this page. Your data is safe — please try again."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "outline" })}
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
