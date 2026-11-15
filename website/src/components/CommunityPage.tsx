import { useEffect, useState } from "react";
import { buttonClass, LABEL, PANEL } from "../../../src/shared/ui/primitives.tsx";
import CommunityImpact from "../../../src/shared/ui/CommunityImpact.tsx";
import { loadCommunityImpact, type CommunityImpactData } from "../lib/api";

export default function CommunityPage() {
  const [data, setData] = useState<CommunityImpactData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCommunityImpact()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <CommunityImpact data={data} error={error}>
      {/* Copy plus the action it asks for - the panel is full width, so the
          button anchors the empty half instead of leaving dead space */}
      <div
        className={`${PANEL} p-[18px] flex flex-col gap-4 min-[861px]:flex-row min-[861px]:items-center min-[861px]:gap-6`}
      >
        <div className="min-w-0">
          <p className={`${LABEL} mb-2`}>Every game counts</p>
          <p className="text-[13px] text-lol-text leading-relaxed max-w-[80ch]">
            Each contributed game adds all ten players' champions, augments, items, and combat lines
            to the pool - anonymously, with duplicates counted once. The more players opt in, the
            sharper the tier lists get, especially early in a patch. Install the tracker and flip on
            Community Stats in Settings to be part of it, or read{" "}
            <a href="/about/" className="text-lol-gold hover:text-lol-gold-light">
              how the stats work
            </a>
            .
          </p>
        </div>
        <a href="/download/" className={buttonClass("gold", "lg", "shrink-0 min-[861px]:ml-auto")}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="m7 12 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          Download MayhemStats Tracker
        </a>
      </div>
    </CommunityImpact>
  );
}
