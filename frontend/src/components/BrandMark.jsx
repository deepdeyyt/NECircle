import { Link } from "react-router-dom";

export function BrandMark({ to = "/", className = "", subtitle = true }) {
  return (
    <Link
      to={to}
      data-testid="brand-mark"
      className={`inline-flex items-baseline gap-2 group ${className}`}
    >
      <span className="font-display text-2xl font-extrabold tracking-tight text-white">
        NE<span className="text-neon">Circle</span>
      </span>
      {subtitle && (
        <span className="hidden sm:inline text-xs text-white/70 font-body">
          Connecting the Northeast
        </span>
      )}
    </Link>
  );
}
