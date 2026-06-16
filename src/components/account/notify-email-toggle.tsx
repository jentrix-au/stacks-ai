"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { setNotifyEmailAction } from "@/server/actions/notifications";

/** Per-user toggle for immediate notification emails (mention/assign). */
export function NotifyEmailToggle({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);

  function toggle(next: boolean) {
    const prev = enabled;
    setEnabled(next);
    setNotifyEmailAction({ enabled: next }).catch(() => {
      setEnabled(prev);
      toast.error("Could not update the email preference");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id="notify-email"
        checked={enabled}
        onCheckedChange={(v) => toggle(v === true)}
      />
      <Label
        htmlFor="notify-email"
        className="text-muted-foreground text-xs font-normal"
      >
        Email me immediately when I&rsquo;m mentioned or assigned
      </Label>
    </div>
  );
}
