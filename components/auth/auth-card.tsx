import Link from "next/link";
import type { ReactNode } from "react";

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-12">
      <Link href="/" className="mb-10 text-lg font-semibold tracking-tight">
        KeepTrack
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? (
        <div className="mt-2 text-sm text-muted-foreground">{description}</div>
      ) : null}
      {children ? <div className="mt-8 grid gap-6">{children}</div> : null}
    </main>
  );
}
