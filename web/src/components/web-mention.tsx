type Props = { url: string; title: string | null; snippet: string | null; source: string };

export function WebMention({ url, title, snippet, source }: Props) {
  return (
    <div className="web">
      <div className="src" data-s={source}>{source.replace("_", " ")}</div>
      <div className="body">
        <a className="t" href={url} target="_blank" rel="noopener noreferrer">{title || url}</a>
        {snippet && <div className="sn">{snippet}</div>}
      </div>
    </div>
  );
}
