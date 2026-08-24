import { Link } from "react-router-dom";

/**
 * NECircle brand mark — the yellow logo tile.
 * The tagline "Connecting the Northeast..." is baked into the artwork itself.
 */
export function BrandMark({ to = "/", className = "", size = 44 }) {
  return (
    <Link
      to={to}
      data-testid="brand-mark"
      className={`inline-flex items-center group ${className}`}
    >
      <img
        src="/necircle-logo.png"
        alt="NECircle · Connecting the Northeast"
        style={{ height: size, width: "auto" }}
        className="block select-none transition-transform group-hover:-rotate-1 group-hover:scale-[1.03]"
        draggable="false"
      />
    </Link>
  );
}
