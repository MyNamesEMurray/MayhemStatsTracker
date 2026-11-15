import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { PANEL } from "./primitives";
import SortHeader, { type SortDir, type SortState } from "./SortHeader";
import SortControl, { type SortOption } from "./SortControl";
import { sortOptions, sortRows, type BoardColumn, type CardArea } from "./boardSort";

// The tier list, once.
//
// The desktop app and mayhemstats.com each had their own champions board and
// their own augments board: four files, about 1,200 lines, drawing the same
// two tables from the same numbers with the same scoring. They had drifted in
// ways nobody chose. The app carried Kills, Deaths, Assists and Gold columns
// the site did not; the site collapsed to cards on a narrow window and the
// app did not, so running the app in a half-width window beside a game - the
// way a second-screen tool actually gets used - gave a squeezed table.
//
// A board is a list of columns now. Each column says how to draw a cell, what
// to sort it by, and where it lands when the table becomes cards. Everything
// that was written twice - the sort comparator, the header row, the card
// breakpoint, the empty state - is here or in boardSort.ts beside it.

const TH = "px-3 py-[9px] text-left text-[11px] font-medium uppercase tracking-[.08em] select-none";

export default function StatBoard<Row, K extends string>({
  columns,
  rows,
  rowKey,
  onRowClick,
  sort,
  onSort,
  empty,
  minWidth = 1000,
  sticky,
  fitsFrom = "lg",
  topScroll,
  renderAfterRow,
  footnote,
  rowClass,
}: {
  columns: BoardColumn<Row, K>[];
  rows: Row[];
  rowKey: (row: Row) => string | number;
  onRowClick?: (row: Row) => void;
  sort: SortState<K>;
  onSort: (key: K, naturalDir?: SortDir) => void;
  empty: ReactNode;
  // What the table needs before it is worth scrolling sideways instead of
  // squeezing. Under it the panel scrolls; under 700px the cards take over.
  minWidth?: number;
  // Freeze the header row under the site's own sticky header while the page
  // scrolls. Off by default: the desktop app lays its boards out differently.
  sticky?: "page";
  // The window width from which the table fits without scrolling sideways, so
  // the panel can clip instead of scroll and the header can stick to the page.
  // Narrower, it scrolls sideways and the header does not freeze.
  fitsFrom?: "lg" | "xl";
  // A second horizontal scrollbar above the table, shown only while the table
  // is actually scrolling sideways, so it need not be found 50 rows down.
  topScroll?: boolean;
  // An expanded row's contents, drawn as a full-width row underneath
  renderAfterRow?: (row: Row) => ReactNode;
  footnote?: ReactNode;
  rowClass?: (row: Row) => string;
}) {
  const mainRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  // Width of the scrolling content while the panel scrolls sideways, else 0
  const [overflowW, setOverflowW] = useState(0);
  useEffect(() => {
    const el = mainRef.current;
    if (!topScroll || !el) return;
    const measure = () => {
      const scrolls = ["auto", "scroll"].includes(getComputedStyle(el).overflowX);
      setOverflowW(scrolls && el.scrollWidth > el.clientWidth + 1 ? el.scrollWidth : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [topScroll, rows.length, columns.length]);
  // Either bar moves the other; setting a value it already has fires no event,
  // so the two cannot ping-pong
  const follow = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (from && to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  };

  const hasRank = columns.some((c) => c.area === "rank");
  const sortProps = { sort, onSort, thClass: TH };

  return (
    <>
      {topScroll && overflowW > 0 && (
        <div
          ref={topRef}
          onScroll={() => follow(topRef.current, mainRef.current)}
          aria-hidden="true"
          className={`overflow-x-auto overflow-y-hidden min-h-[14px] ${
            sticky === "page" ? "sticky z-10 top-[var(--site-header-h,0px)]" : ""
          }`}
        >
          <div style={{ width: overflowW, height: 1 }} />
        </div>
      )}
      <div
        ref={mainRef}
        onScroll={() => follow(mainRef.current, topRef.current)}
        className={`${PANEL} ${
          sticky === "page"
            ? // Clipping instead of scrolling is what lets the header stick to
              // the page, so it only applies once the table fits unscrolled
              fitsFrom === "xl"
              ? "overflow-x-auto min-[1700px]:overflow-x-clip"
              : "overflow-x-auto min-[1100px]:overflow-x-clip"
            : "overflow-x-auto"
        }`}
      >
        <table
          data-sticky={sticky}
          className="stat-board table-fixed w-full border-collapse"
          style={{ minWidth: `${minWidth}px` }}
          data-rank={hasRank ? "yes" : "no"}
        >
          <thead className="bg-lol-dark/50">
            <tr>
              {columns.map((c, i) =>
                c.key == null ? (
                  <th
                    key={i}
                    className={`${TH} text-lol-text ${c.width ?? ""} ${
                      c.detail ? "board-detail" : ""
                    }`}
                  >
                    {c.label}
                  </th>
                ) : (
                  <SortHeader
                    key={i}
                    label={
                      c.shortLabel ? (
                        <>
                          <span className="max-[1199px]:hidden">{c.label}</span>
                          <span className="min-[1200px]:hidden">{c.shortLabel}</span>
                        </>
                      ) : (
                        c.label
                      )
                    }
                    field={c.key}
                    naturalDir={c.naturalDir}
                    title={c.headerTitle}
                    className={`${c.width ?? ""} ${c.detail ? "board-detail" : ""}`}
                    {...sortProps}
                  />
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <Fragment key={rowKey(row)}>
                <tr
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`group border-t border-lol-border/50 transition-colors ${
                    onRowClick ? "hover:bg-lol-card-hover cursor-pointer" : ""
                  } ${rowClass?.(row) ?? ""}`}
                >
                  {columns.map((c, ci) => (
                    <td
                      key={ci}
                      // The card layout reads these two rather than counting
                      // columns. The CSS it replaced keyed off nth-child, so
                      // inserting a column silently relabelled every figure
                      // after it.
                      data-area={c.area ?? "stat"}
                      data-label={
                        (c.area ?? "stat") === "stat" ? (c.cardLabel ?? c.label) : undefined
                      }
                      className={`px-3 py-[9px] ${c.cellClass ?? ""} ${
                        c.detail ? "board-detail" : ""
                      }`}
                    >
                      {c.render(row, i)}
                    </td>
                  ))}
                </tr>
                {renderAfterRow?.(row)}
              </Fragment>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="py-8 text-center text-sm text-lol-text">{empty}</div>}
      </div>
      {footnote && <p className="text-xs text-lol-text/70">{footnote}</p>}
    </>
  );
}

export { SortControl, sortOptions, sortRows };
export type { SortOption, BoardColumn, CardArea };
