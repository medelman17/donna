import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, GitFork } from "lucide-react";

type Props = { name: string; htmlUrl: string; description: string | null; language: string | null; stars: number; forks: number; isFork: boolean };

export function RepoCard({ name, htmlUrl, description, language, stars, forks, isFork }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          <a href={htmlUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{name}</a>
          {isFork && <Badge variant="outline" className="ml-2 text-xs">fork</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        {description && <p className="line-clamp-2">{description}</p>}
        <div className="flex items-center gap-3 pt-1">
          {language && <Badge variant="secondary">{language}</Badge>}
          <span className="flex items-center gap-1"><Star className="h-3 w-3" /> {stars}</span>
          <span className="flex items-center gap-1"><GitFork className="h-3 w-3" /> {forks}</span>
        </div>
      </CardContent>
    </Card>
  );
}
