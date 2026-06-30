import { Link, useLocation } from 'react-router-dom';
import { Logo, Icon } from '../components/ui.jsx';

export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="text-center max-w-[440px]">
        <div className="inline-flex items-center gap-2.5 mb-7">
          <Logo size={34} />
          <span className="font-display text-xl font-extrabold text-ink tracking-tight">Parley</span>
        </div>
        <p className="font-display text-[64px] leading-none font-extrabold text-ink/90 tracking-tight">404</p>
        <h1 className="font-display text-[20px] font-bold text-ink mt-3">Page not found</h1>
        <p className="text-sm text-muted leading-relaxed mt-2">
          We couldn't find <code className="text-ink-2 break-all">{pathname}</code>. It may have moved, or the link is wrong.
        </p>
        <div className="flex items-center justify-center gap-2.5 mt-7">
          <Link to="/" className="btn btn-primary !py-2.5">
            <Icon.Home width={16} height={16} /> Back to dashboard
          </Link>
          <Link to="/meetings" className="btn btn-ghost !py-2.5">
            <Icon.Meetings width={16} height={16} /> Meetings
          </Link>
        </div>
      </div>
    </div>
  );
}
