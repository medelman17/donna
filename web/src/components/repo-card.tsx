import { LangBadge, fmtNum, relTime } from "./atoms";

type Props = {
  name: string; htmlUrl: string; description: string | null;
  language: string | null; stars: number; forks: number;
  isFork: boolean; pushedAt: Date | null;
};

export function RepoCard({ name, htmlUrl, description, language, stars, forks, isFork, pushedAt }: Props) {
  return (
    <div className="repo">
      <div>
        <a className="r-name" href={htmlUrl} target="_blank" rel="noopener noreferrer">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--color-fg-subtle)" style={{ flexShrink: 0 }}>
            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
          </svg>
          {name}
          {isFork && <span className="r-fork-flag">fork</span>}
        </a>
        <div className="r-descr">{description || <span className="dim">No description</span>}</div>
      </div>
      <div className="r-meta" style={{ alignSelf: "flex-start" }}>
        {language && <LangBadge name={language} />}
        <span className="item">{"★"} {fmtNum(stars)}</span>
        <span className="item">{"⑂"} {forks}</span>
        <span className="item dim">{relTime(pushedAt)}</span>
      </div>
    </div>
  );
}
