import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIAdvisoryBadgeProps {
  className?: string;
  compact?: boolean;
}

/**
 * Small pill communicating that a surface renders AI-assisted decision-support
 * guidance rather than a definitive instruction. Applied to every AI output in
 * the app (Agronomist, Planting Insights, Yield Prediction, Crop Health NDVI).
 */
export const AIAdvisoryBadge = ({ className, compact = false }: AIAdvisoryBadgeProps) => (
  <div
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900",
      className
    )}
    role="note"
    aria-label="AI-assisted decision-support guidance"
  >
    <Info className="h-3 w-3" />
    {compact ? (
      <span>AI-assisted guidance</span>
    ) : (
      <span>AI-assisted guidance · decision-support, verify locally</span>
    )}
  </div>
);

export default AIAdvisoryBadge;
