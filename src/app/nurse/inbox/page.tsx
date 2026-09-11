import { Shell } from "@/components/shell";
import { InboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  return (
    <Shell role="nurse">
      <InboxClient />
    </Shell>
  );
}
