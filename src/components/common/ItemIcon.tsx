import { useState } from "react";
import { useGameDataStore } from "../../stores/gameDataStore";

interface ItemIconProps {
  iconId?: number;
  name?: string;
  size?: number;
  className?: string;
}

/**
 * Renders a 32×32 item icon from the Project Gorgon CDN.
 * URL pattern: https://cdn.projectgorgon.com/v{version}/icons/icon_{iconId}.png
 * Falls back to a placeholder box if the icon is missing or the CDN version is unknown.
 */
export function ItemIcon({ iconId, name, size = 32, className = "" }: ItemIconProps) {
  const cdnVersion = useGameDataStore((s) => s.cdnVersion);
  const [errored, setErrored] = useState(false);

  if (!iconId || !cdnVersion || errored) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded bg-bg-primary border border-border/30 shrink-0 ${className}`}
        title={name}
      />
    );
  }

  const url = `https://cdn.projectgorgon.com/v${cdnVersion}/icons/icon_${iconId}.png`;

  return (
    <img
      src={url}
      alt={name ?? ""}
      title={name}
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ imageRendering: "pixelated" }}
      onError={() => setErrored(true)}
    />
  );
}
