// The footnotes under the two tier lists, written once so the site and the app
// say the same thing about how a score is read.
const SCORE =
  "Score is the win rate the record supports, out of 100 - the floor of a 95% confidence interval, so a thin sample scores well below the rate it happened to produce.";
const THIN = "* fewer than 20 games - treat with caution.";

export const CHAMPIONS_FOOTNOTE = `${SCORE} Tiers rank Score across the current filter. ${THIN}`;
export const AUGMENTS_FOOTNOTE = `${SCORE} Tiers rank each augment against others of its rarity. ${THIN}`;
