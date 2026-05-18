"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUSES = ["all", "new", "reviewing", "interested", "contacted", "passed", "hired"];
const SORTS = [
  { value: "fitScore", label: "Fit Score" },
  { value: "followers", label: "Followers" },
  { value: "publicRepos", label: "Public Repos" },
  { value: "fetchedAt", label: "Recently Fetched" },
];

export function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 pb-4">
      <Input placeholder="Search..." defaultValue={searchParams.get("q") ?? ""}
             onChange={(e) => update("q", e.target.value)} className="w-64" />
      <Select defaultValue={searchParams.get("status") ?? "all"} onValueChange={(v) => update("status", v as string)}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All" : s}</SelectItem>)}</SelectContent>
      </Select>
      <Select defaultValue={searchParams.get("sort") ?? "fitScore"} onValueChange={(v) => update("sort", v as string)}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Sort" /></SelectTrigger>
        <SelectContent>{SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
