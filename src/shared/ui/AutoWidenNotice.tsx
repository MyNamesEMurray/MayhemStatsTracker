import { formatPatch } from "../patch";
import type { WidenTo } from "../autoWiden";
import { InfoIcon } from "./icons";

const BOX =
  "flex items-start gap-3 rounded-xl border border-lol-gold/25 bg-lol-gold/[0.06] px-4 py-3";

function Info() {
  return (
    <InfoIcon
      width={15}
      height={15}
      className="mt-[3px] shrink-0 text-lol-gold"
      aria-hidden="true"
    />
  );
}

// "scope" finishes the sentence: "so far" for a board, "on this champion"
// for a champion page
export function AutoWidenNotice({
  widen,
  scope,
  className = "mb-4",
}: {
  widen: WidenTo;
  scope: string;
  className?: string;
}) {
  return (
    <div className={`${BOX} ${className}`}>
      <Info />
      <p className="text-[13px] leading-relaxed text-lol-text">
        <span className="text-lol-text-bright">
          Showing {formatPatch(widen.from)}–{formatPatch(widen.to)}.
        </span>{" "}
        {formatPatch(widen.to)} alone has{" "}
        {widen.onLatest === 0
          ? "no games"
          : `${widen.onLatest} game${widen.onLatest === 1 ? "" : "s"}`}{" "}
        {scope}.
        {!widen.reached &&
          ` Still thin at ${widen.widened.toLocaleString()} - read as directional.`}
      </p>
    </div>
  );
}

// Offered after the reader steps back to the newest patch alone
export function WidenHint({
  widen,
  scope,
  onApply,
  className = "mb-4",
}: {
  widen: WidenTo;
  scope: string;
  onApply: () => void;
  className?: string;
}) {
  return (
    <div className={`${BOX} ${className}`}>
      <Info />
      <p className="text-[13px] leading-relaxed text-lol-text">
        {formatPatch(widen.to)} has{" "}
        {widen.onLatest === 0
          ? "no games"
          : `only ${widen.onLatest} game${widen.onLatest === 1 ? "" : "s"}`}{" "}
        {scope}, so these numbers are thin.{" "}
        <button
          onClick={onApply}
          className="text-lol-gold hover:text-lol-gold-light underline underline-offset-2 cursor-pointer"
        >
          Include {formatPatch(widen.from)}–{formatPatch(widen.to)}
        </button>
      </p>
    </div>
  );
}
