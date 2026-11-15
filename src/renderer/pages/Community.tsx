import { useEffect, useState } from "react";
import type { CommunityImpactData } from "../../shared/communityImpact";
import CommunityImpact from "../../shared/ui/CommunityImpact";
import { LABEL, PANEL } from "../../shared/ui/primitives";

export default function Community() {
  const [data, setData] = useState<CommunityImpactData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.api
      .getCommunityImpact()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="w-full">
      <CommunityImpact data={data} error={error}>
        <div className={`${PANEL} p-[18px]`}>
          <p className={`${LABEL} mb-2`}>Every game counts</p>
          <p className="text-[13px] text-lol-text leading-relaxed max-w-[80ch]">
            Each contributed game adds all ten players' champions, augments, items, and combat lines
            to the pool - anonymously, with duplicates counted once. Turn on Community Stats in
            Settings to be part of it, or read{" "}
            <button
              type="button"
              onClick={() => window.api.openUrl("https://mayhemstats.com/about/")}
              className="text-lol-gold hover:text-lol-gold-light cursor-pointer"
            >
              how the stats work
            </button>
            .
          </p>
        </div>
      </CommunityImpact>
    </div>
  );
}
