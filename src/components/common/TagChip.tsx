/**
 * Small pill/chip used to display a single user-defined tag.
 * Colored via `tagColorClasses()` from the tags store. Optionally shows
 * a close button so parent components can wire removal.
 */
import { useTagsStore, tagColorClasses } from "../../stores/tagsStore";

interface Props {
  name: string;
  onClick?: () => void;
  onRemove?: () => void;
  active?: boolean;
  className?: string;
  title?: string;
  size?: "xs" | "sm";
}

export function TagChip({ name, onClick, onRemove, active, className, title, size = "xs" }: Props) {
  const def = useTagsStore((s) => s.getTagDefinition(name));
  const colorClasses = tagColorClasses(def?.color);
  const sizeClasses = size === "sm"
    ? "text-sm px-2.5 py-1 gap-1.5"
    : "text-xs px-1.5 py-0.5 gap-1";
  const activeRing = active ? "ring-2 ring-accent/60" : "";
  const clickable = onClick ? "cursor-pointer hover:brightness-110" : "";

  return (
    <span
      className={`inline-flex items-center rounded-full border ${colorClasses} ${sizeClasses} ${activeRing} ${clickable} ${className ?? ""}`}
      onClick={onClick}
      title={title ?? def?.description ?? name}
    >
      <span className="leading-none">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 leading-none opacity-70 hover:opacity-100 focus:outline-none"
          aria-label={`Remove tag ${name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
