import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "./status-pill";

type Props = {
  login: string; name: string | null; avatarUrl: string | null;
  location: string | null; summary: string | null;
  fitScore: number | null; status: string; topLanguages: string[];
};

export function CandidateRow({ login, name, avatarUrl, location, summary, fitScore, status, topLanguages }: Props) {
  return (
    <Link href={`/candidates/${login}`}
          className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50">
      {avatarUrl && <img src={avatarUrl} alt={login} className="h-10 w-10 rounded-full" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{name || login}</span>
          {name && <span className="text-sm text-muted-foreground">@{login}</span>}
          {location && <span className="text-xs text-muted-foreground">{location}</span>}
        </div>
        <p className="truncate text-sm text-muted-foreground">{summary || "No summary yet"}</p>
      </div>
      <div className="flex items-center gap-2">
        {topLanguages.slice(0, 3).map((l) => <Badge key={l} variant="secondary" className="text-xs">{l}</Badge>)}
      </div>
      <div className="flex items-center gap-3">
        {fitScore != null && <Badge variant={fitScore >= 4 ? "default" : "outline"}>{fitScore}/5</Badge>}
        <StatusPill status={status} />
      </div>
    </Link>
  );
}
