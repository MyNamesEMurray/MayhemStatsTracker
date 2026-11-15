import { useMemo, useState } from "react";
import type { ChampionStatRow } from "../lib/api";
import type { ChampionData } from "../lib/dragon";
import { getChampionName } from "../lib/dragon";
import { aggregateChampions, assignTiers, score, type Filters } from "../lib/stats";
import SearchField from "../../../src/shared/ui/SearchField.tsx";
import { useSort } from "../../../src/shared/ui/SortHeader.tsx";
import StatBoard, {
  SortControl,
  sortOptions,
  sortRows,
} from "../../../src/shared/ui/StatBoard.tsx";
import { championColumns, type ChampionSortKey } from "../../../src/shared/ui/boardColumns.tsx";
import { championSlug } from "../lib/slug";

const ROLES = ["Fighter", "Tank", "Mage", "Assassin", "Support", "Marksman"];

export default function ChampionsTable({
  rows,
  filters,
  totalSlots,
  championData,
  onSelectChampion,
}: {
  rows: ChampionStatRow[];
  filters: Filters;
  totalSlots: number;
  championData: ChampionData;
  onSelectChampion: (championId: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const { sort, toggle } = useSort<ChampionSortKey>("score");

  // Tiers are ranked across ALL champions under the current filter, before
  // search narrows the list - searching "teemo" must not make Teemo S+
  const { list, tiers } = useMemo(() => {
    const aggregated = aggregateChampions(rows, filters);
    const tiers = assignTiers(
      aggregated,
      (c) => score(c.wins, c.games),
      (c) => c.champion_id,
    );
    // The site's aggregate carries totals; the board reads the two big
    // figures per game, which is the shape the app's rows already have.
    const list = aggregated.map((c) => ({
      ...c,
      avg_damage: c.games > 0 ? c.damage / c.games : 0,
      avg_gold: c.games > 0 ? c.gold / c.games : 0,
    }));
    return { list, tiers };
  }, [rows, filters]);

  const columns = useMemo(
    () =>
      championColumns({
        tiers,
        totalSlots,
        name: (id) => getChampionName(championData, id),
        // The site links every champion name, so a row is shareable and a
        // crawler has something to follow. The app has no URLs to link to.
        href: (id) => `/champion/${championSlug(getChampionName(championData, id))}/`,
      }),
    [tiers, totalSlots, championData],
  );

  const sorted = useMemo(() => {
    // Tier assignment above still sees the full cohort - hiding low-sample
    // rows must not promote what remains
    let filtered = list;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((c) =>
        getChampionName(championData, c.champion_id).toLowerCase().includes(q),
      );
    }
    if (role) {
      filtered = filtered.filter((c) => championData[c.champion_id]?.tags?.includes(role));
    }
    return sortRows(filtered, columns, sort);
  }, [list, columns, search, role, sort, championData]);

  const hasRoles = Object.values(championData).some((c) => c.tags?.length);
  const chip = (label: string, value: string | null) => (
    <button
      key={label}
      onClick={() => setRole(value)}
      className={`px-3 max-[700px]:px-1 py-1 text-xs font-medium rounded-lg border transition-colors ${
        role === value
          ? "border-lol-gold/50 bg-lol-gold/15 text-lol-gold-light"
          : "border-lol-border bg-lol-card text-lol-text hover:text-lol-gold-light"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs tabular-nums min-w-[6rem] max-[700px]:w-full">
          {sorted.length} champion{sorted.length === 1 ? "" : "s"}
        </span>
        {hasRoles && (
          <div className="grid grid-cols-4 gap-1.5 w-full min-[701px]:flex min-[701px]:flex-wrap min-[701px]:w-auto min-[701px]:items-center">
            {chip("All", null)}
            {ROLES.map((r) => chip(r, r))}
          </div>
        )}
        <SortControl options={sortOptions(columns)} sort={sort} onSort={toggle} />
        <div className="ml-auto w-48 max-[700px]:ml-0 max-[700px]:w-full">
          <SearchField value={search} onChange={setSearch} placeholder="Search champion..." />
        </div>
      </div>

      <StatBoard
        columns={columns}
        rows={sorted}
        rowKey={(c) => c.champion_id}
        onRowClick={(c) => onSelectChampion(c.champion_id)}
        sort={sort}
        onSort={toggle}
        empty={role ? `No ${role} champions match` : "No champions found"}
        sticky="page"
        topScroll
        footnote={
          <>
            Score is the win rate the record supports, out of 100 - the floor of a 95% confidence
            interval, so a thin sample scores well below the rate it happened to produce. Tiers rank
            Score across the current filter. * fewer than 20 games - treat with caution.
          </>
        }
      />
    </div>
  );
}
