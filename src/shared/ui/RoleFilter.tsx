// The champion role chips, shared by the desktop app and mayhemstats.com.
// Renders its own responsive wrapper: a four-column grid on a phone, one
// wrapping row from 701px up.
export const ROLES = ["Fighter", "Tank", "Mage", "Assassin", "Support", "Marksman"];

export default function RoleFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (role: string | null) => void;
}) {
  const chip = (label: string, role: string | null) => (
    <button
      key={label}
      onClick={() => onChange(role)}
      className={`px-3 max-[700px]:px-1 py-1 text-xs font-medium rounded-lg border transition-colors ${
        value === role
          ? "border-lol-gold/50 bg-lol-gold/15 text-lol-gold-light"
          : "border-lol-border bg-lol-card text-lol-text hover:text-lol-gold-light"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="grid grid-cols-4 gap-1.5 w-full min-[701px]:flex min-[701px]:flex-wrap min-[701px]:w-auto min-[701px]:items-center">
      {chip("All", null)}
      {ROLES.map((r) => chip(r, r))}
    </div>
  );
}
