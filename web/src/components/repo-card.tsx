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
