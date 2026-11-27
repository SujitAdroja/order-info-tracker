import { ContactIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CONTACT_FILENAME, CONTACT_NAME } from "@/lib/forwarding";

export function ForwardingAddressCard({
  address,
  footer,
}: {
  address: string;
  /** Extra controls under the address (Settings: "Get a new address"). */
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your forwarding address</CardTitle>
        <CardDescription>
          Forward order confirmations and invoices here. Only you know this
          address, so keep it private.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <code
          data-testid="forwarding-address"
          className="rounded-md bg-muted px-3 py-2 font-mono text-sm break-all select-all"
        >
          {address}
        </code>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={address} label="Copy address" />
          <a
            href="/api/me/contact"
            download={CONTACT_FILENAME}
            data-testid="add-to-contacts"
            className={buttonVariants({ variant: "outline" })}
          >
            <ContactIcon aria-hidden />
            Add to contacts
          </a>
        </div>
        <p className="text-sm text-muted-foreground">
          Save it as a contact once. Then type &ldquo;Keep&rdquo; in the To
          field of Gmail, Outlook or Apple Mail and it fills in &ldquo;
          {CONTACT_NAME}&rdquo; for you.
        </p>
      </CardContent>
      {footer ? <CardContent>{footer}</CardContent> : null}
    </Card>
  );
}

export function ForwardingAddressSkeleton() {
  return (
    <Card aria-busy="true">
      <CardHeader>
        <CardTitle>Your forwarding address</CardTitle>
        <CardDescription>Loading…</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-9 animate-pulse rounded-md bg-muted" />
      </CardContent>
    </Card>
  );
}
