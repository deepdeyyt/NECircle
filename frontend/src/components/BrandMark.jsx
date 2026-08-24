import { Link } from "react-router-dom";

export function BrandMark({ to = "/", className = "" }) {
  return (
    <Link
      to={to}
      data-testid="brand-mark"
      className={`inline-flex items-baseline gap-2 group ${className}`}
    >
      <span className="font-display text-2xl font-extrabold tracking-tight text-ink">
        NE<span className="text-clay">Circle</span>
      </span>
      <span className="hidden sm:inline text-xs text-ink-muted font-body">
        Connecting the Northeast
      </span>
    </Link>
  );
}
