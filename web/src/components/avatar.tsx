const AV_BG = [
  "#e06c75", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#98c379",
  "#d19a66", "#be5046", "#7ec8e3", "#c9a0dc", "#4ec9b0", "#d4a373",
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getInitials(name: string | null, login: string): string {
  if (name) {
    const parts = name.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return login.slice(0, 2).toUpperCase();
}

type AvatarProps = {
  name: string | null;
  login: string;
  avatarUrl: string | null;
  size?: number;
};

export function Avatar({ name, login, avatarUrl, size = 22 }: AvatarProps) {
  const bg = AV_BG[hashCode(login) % AV_BG.length];
  const initials = getInitials(name, login);

  return (
    <div className="av" style={{ "--av-size": `${size}px`, background: bg } as React.CSSProperties}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={login} />
      ) : (
        initials
      )}
    </div>
  );
}
