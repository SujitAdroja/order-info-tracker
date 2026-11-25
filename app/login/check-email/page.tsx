import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <AuthCard
      title="Check your email"
      description={
        <>
          <p>
            We sent you a sign-in link. It works once and expires in 24 hours.
          </p>
          <p className="mt-4">
            Didn&apos;t get it? Check spam, or{" "}
            <Link
              href="/login"
              className="text-foreground underline underline-offset-4"
            >
              send a new link
            </Link>
            .
          </p>
        </>
      }
    />
  );
}
