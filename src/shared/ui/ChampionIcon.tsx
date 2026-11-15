import { CHAMPION_ICON_URL } from "../cdn";

export default function ChampionIcon({
  championId,
  size = 32,
  className = "",
}: {
  championId: number;
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={CHAMPION_ICON_URL(championId)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      // The art is a square; a circle crops its corners and shows the edge
      className={`shrink-0 ${className}`}
      style={{ borderRadius: Math.round(size * 0.22) }}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
