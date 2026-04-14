/**
 * Horizontal chip bar that shows every defined custom tag and lets the
 * user toggle which ones to filter by. Semantics are "any-of": the
 * parent filter list passes a row if it carries any of the selected
 * tags. When no tags are selected the filter is a no-op, so the bar
 * quietly hides itself whenever the user has no tag definitions.
 */
import { useTagsStore } from "../../stores/tagsStore";
import { TagChip } from "./TagChip";

interface Props {
  selected: Set<string>;
  onToggle: (name: string) => void;
  onClear: () => void;
  label?: string;
}

export function TagFilter({ selected, onToggle, onClear, label = "Tags" }: Props) {
  const tags = useTagsStore((s) => s.tags);
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-text-muted mr-1">{label}:</span>
      {tags.map((t) => {
        const active = selected.has(t.name);
        return (
          <TagChip
            key={t.name}
            name={t.name}
            active={active}
            onClick={() => onToggle(t.name)}
            size="xs"
            className={active ? "" : "opacity-60 hover:opacity-100"}
          />
        );
      })}
      {selected.size > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-text-muted hover:text-text-primary border border-border rounded px-1.5 py-0.5 transition-colors ml-1"
        >
          Clear
        </button>
      )}
    </div>
  );
}
