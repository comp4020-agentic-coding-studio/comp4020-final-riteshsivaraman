// Every address gets a deterministic colored initial --- real email clients
// (Outlook, Gmail) do this too, so it reads as polish, not as a stylistic
// risk, and it quietly reinforces "everyone here has a visible identity."
const HUES = [210, 255, 15, 160, 35, 280, 190];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function Avatar({ address, size = 28 }: { address: string; size?: number }) {
  const hue = HUES[hash(address) % HUES.length];
  const initial = (address[0] ?? "?").toUpperCase();
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        minWidth: size,
        borderRadius: "50%",
        background: `hsl(${hue} 45% 93%)`,
        color: `hsl(${hue} 55% 32%)`,
        fontWeight: 600,
        fontSize: size * 0.4,
        fontFamily: "var(--font-ui)",
      }}
    >
      {initial}
    </span>
  );
}
