import { signInWithGoogle } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function GoogleSignInButton({ callbackUrl }: { callbackUrl?: string }) {
  return (
    <form action={signInWithGoogle} className="grid">
      {callbackUrl ? (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      ) : null}
      <Button type="submit" variant="outline" size="lg">
        Continue with Google
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Sign-in only. We never request access to your Gmail.
      </p>
    </form>
  );
}
