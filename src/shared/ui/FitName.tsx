import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// A name that keeps its row height. It is drawn at full size when it fits,
// steps down a size when it does not, and only as a last resort drops to two
// short lines that together are no taller than the icon beside it. Decided by
// measuring, not by counting characters, so a long name in a wide column is
// left alone.
const STEPS = [
  "text-sm whitespace-nowrap",
  "text-[12.5px] whitespace-nowrap",
  "text-[11px] leading-[1.1] line-clamp-2",
];

export default function FitName({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [step, setStep] = useState(0);
  const [width, setWidth] = useState(0);

  // A new name, or a column that changed width, starts over from full size
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth);
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => setStep(0), [children, width]);

  // Only when the name, the width or the step changes, so a table full of these
  // does not force a layout read per row on every unrelated render
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || step >= STEPS.length - 1) return;
    if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
      setStep(step + 1);
    }
  }, [step, children, width]);

  return (
    <span ref={ref} className={`block min-w-0 overflow-hidden ${STEPS[step]} ${className}`}>
      {children}
    </span>
  );
}
