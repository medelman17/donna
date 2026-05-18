"use client";

import { useRef, useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { updateCrm } from "@/app/candidates/[login]/actions";

const STATUSES = ["new", "reviewing", "interested", "contacted", "passed", "hired"];

type Props = { login: string; status: string; notes: string | null; tags: string | null };

export function CrmPanel({ login, status, notes, tags }: Props) {
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function save(field: string, value: string) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(() => { updateCrm(login, { [field]: value }); });
    }, 500);
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h3 className="font-semibold">CRM</h3>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Status</label>
          <Select defaultValue={status} onValueChange={(v) => { startTransition(() => updateCrm(login, { status: v as string })); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Notes</label>
          <Textarea defaultValue={notes ?? ""} placeholder="Add notes..." onChange={(e) => save("notes", e.target.value)} rows={4} />
        </div>
        <div>
          <label className="text-sm font-medium">Tags</label>
          <Input defaultValue={tags ?? ""} placeholder="comma-separated" onChange={(e) => save("tags", e.target.value)} />
        </div>
        {isPending && <p className="text-xs text-muted-foreground">Saving...</p>}
      </div>
    </div>
  );
}
