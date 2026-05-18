import { Badge } from "@/components/ui/badge";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  reviewing: "bg-yellow-100 text-yellow-800",
  interested: "bg-green-100 text-green-800",
  contacted: "bg-purple-100 text-purple-800",
  passed: "bg-gray-100 text-gray-600",
  hired: "bg-emerald-100 text-emerald-900",
};

export function StatusPill({ status }: { status: string }) {
  return <Badge variant="outline" className={STATUS_COLORS[status] ?? ""}>{status}</Badge>;
}
