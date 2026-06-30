/* Page container + section header used across all pages for consistent rhythm. */
export function Page({ children, max = '1180px', className = '' }) {
  return (
    <div className={`px-6 md:px-8 py-7 mx-auto w-full ${className}`} style={{ maxWidth: max }}>
      {children}
    </div>
  );
}

export function PageHead({ title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display text-[26px] font-extrabold text-ink leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function SectionHead({ title, action }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-sm font-bold text-ink tracking-tight">{title}</h2>
      {action}
    </div>
  );
}
