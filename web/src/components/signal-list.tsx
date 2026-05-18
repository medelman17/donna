import { Badge } from "@/components/ui/badge";

const KIND_STYLES: Record<string, string> = {
  positive: "bg-green-100 text-green-800",
  negative: "bg-red-100 text-red-800",
  notable: "bg-blue-100 text-blue-800",
};

export function SignalList({ signals }: { signals: { kind: string; text: string }[] }) {
  if (!signals.length) return null;
  return (
    <ul className="space-y-1.5">
      {signals.map((s, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <Badge variant="outline" className={KIND_STYLES[s.kind] ?? ""}>{s.kind}</Badge>
          <span>{s.text}</span>
        </li>
      ))}
    </ul>
  );
}
