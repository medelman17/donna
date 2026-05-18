import { relTime } from "./atoms";

type Event = { id: number; type: string; repoName: string | null; createdAt: Date };

export function ActivityList({ events }: { events: Event[] }) {
  return (
    <div className="act-list">
      {events.map(e => (
        <div key={e.id} className="act">
          <span className="when">{relTime(e.createdAt)}</span>
          <span className="ev">{e.type.replace("Event", "")}</span>
          <span className="repo-n">{e.repoName || ""}</span>
        </div>
      ))}
    </div>
  );
}
