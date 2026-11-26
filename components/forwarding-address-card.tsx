import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <code
          data-testid="forwarding-address"
          className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm break-all select-all"
        >
          {address}
        </code>
        <CopyButton value={address} label="Copy address" />
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
