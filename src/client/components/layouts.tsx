import { useEffect, useState, type ReactNode } from 'react';
import {
  LuBell, LuBookOpen, LuCalendarClock, LuClipboardCheck, LuEllipsis, LuFlaskConical, LuHistory, LuLayoutDashboard, LuListChecks, LuLogOut, LuMenu, LuSettings, LuWallet, LuX,
} from 'react-icons/lu';
import { Link, navigate, useLocation } from '../lib/router';
import { useSession } from '../lib/state';
import { ONBOARDING_STEPS, type OnboardingStepKey, type StepStatus } from '../../shared/types';
import { Button, ButtonLink, Dialog, Logo } from './ui';

export function PublicLayout({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.path]);
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="pub-header chrome">
        <div className="container pub-nav">
          <Logo />
          <button className="icon-btn menu-toggle" aria-expanded={open} aria-controls="pub-links" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'}>
            {open ? <LuX aria-hidden="true" /> : <LuMenu aria-hidden="true" />}
          </button>
          <nav id="pub-links" className={`pub-links ${open ? 'open' : ''}`} aria-label="Main">
            <Link to="/how-it-works">How It Works</Link>
            <Link to="/features">Features</Link>
            <Link to="/learn">Learn</Link>
            {status === 'authed' ? (
              <ButtonLink to="/app" size="sm" arrow>Open my plan</ButtonLink>
            ) : (
              <>
                <Link to="/login">Log In</Link>
                <ButtonLink to="/signup" size="sm" arrow>Get Started</ButtonLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="route" key={loc.path}>{children}</main>
      <footer className="pub-footer">
        <div className="container stack stack-lg">
          <div className="footer-grid">
            <div className="stack stack-sm">
              <Logo reverse />
              <p className="small" style={{ color: '#cfd9c7', maxWidth: '34ch' }}>Your financial future starts with one step. Educational planning tools and estimates — not an official loan servicer.</p>
            </div>
            <div className="stack stack-sm">
              <span className="eyebrow" style={{ color: '#cfd9c7' }}>Product</span>
              <ul>
                <li><Link to="/how-it-works">How It Works</Link></li>
                <li><Link to="/features">Features</Link></li>
                <li><Link to="/learn">Learn</Link></li>
              </ul>
            </div>
            <div className="stack stack-sm">
              <span className="eyebrow" style={{ color: '#cfd9c7' }}>Company</span>
              <ul>
                <li><Link to="/about">About</Link></li>
                <li><Link to="/help">Help</Link></li>
              </ul>
            </div>
            <div className="stack stack-sm">
              <span className="eyebrow" style={{ color: '#cfd9c7' }}>Trust</span>
              <ul>
                <li><Link to="/privacy">Privacy</Link></li>
                <li><Link to="/privacy#security">Security</Link></li>
                <li><Link to="/terms">Terms</Link></li>
              </ul>
            </div>
          </div>
          <hr className="rule" style={{ borderColor: '#2e5a41' }} />
          <p className="xs" style={{ color: '#cfd9c7' }}>
            FirstStep is not affiliated with the U.S. Department of Education, Federal Student Aid, any loan servicer, bank or university. Estimates are not official loan statements and are not financial advice.
          </p>
        </div>
      </footer>
    </>
  );
}

const STEP_LABEL: Record<OnboardingStepKey, string> = { graduation: 'Graduation', loans: 'Loans', connections: 'Accounts', summary: 'Review', plan: 'Your plan' };
const STATE_LABEL: Record<StepStatus, string> = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', skipped: 'Skipped', needs_attention: 'Needs attention' };

export function OnboardingLayout({ current, steps, children, actions }: { current: OnboardingStepKey; steps: Record<OnboardingStepKey, StepStatus>; children: ReactNode; actions?: ReactNode }) {
  const idx = ONBOARDING_STEPS.indexOf(current);
  return (
    <div className="onb">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="onb-top chrome">
        <div className="container">
          <Logo to="/" />
          <Button variant="ghost" size="sm" onClick={() => navigate('/app/saved')}>Save &amp; exit</Button>
        </div>
      </header>
      <div className="container" style={{ maxWidth: 900, paddingTop: 20 }}>
        <p className="small muted" style={{ marginBottom: 8 }}>
          Step {idx + 1} of {ONBOARDING_STEPS.length}
        </p>
        <ol className="stepper" aria-label="Setup progress">
          {ONBOARDING_STEPS.map((k) => {
            const s = steps[k];
            const cls = k === current ? 'current' : s === 'completed' ? 'done' : s === 'skipped' ? 'skipped' : s === 'needs_attention' ? 'attention' : '';
            return (
              <li key={k} className={cls} aria-current={k === current ? 'step' : undefined}>
                <span className="label-text">{STEP_LABEL[k]}</span>
                <span className="state">{STATE_LABEL[s]}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <main id="main" className="onb-main">
        <div className="container route" key={current}>{children}</div>
      </main>
      {actions && (
        <div className="onb-actions">
          <div className="container">{actions}</div>
        </div>
      )}
    </div>
  );
}

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LuLayoutDashboard },
  { to: '/app/finances', label: 'My Finances', icon: LuWallet },
  { to: '/app/money-lab', label: 'Money Lab', icon: LuFlaskConical },
  { to: '/app/loan-planner', label: 'Loan Planner', icon: LuCalendarClock },
  { to: '/app/plan', label: 'Action Plan', icon: LuListChecks },
  { to: '/app/learn', label: 'Learn', icon: LuBookOpen },
];
const NAV2 = [
  { to: '/app/notifications', label: 'Notifications', icon: LuBell },
  { to: '/app/review', label: 'Review my data', icon: LuClipboardCheck },
  { to: '/app/history', label: 'Setup & import history', icon: LuHistory },
  { to: '/app/settings', label: 'Settings & privacy', icon: LuSettings },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { data, signOut } = useSession();
  const loc = useLocation();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [loc.path]);
  const unread = data?.notifications.filter((n) => !n.readAt).length ?? 0;
  const isActive = (to: string) => (to === '/app' ? loc.path === '/app' : loc.path.startsWith(to));
  const out = async () => {
    await signOut();
    navigate('/login?signedOut=1');
  };
  const item = (n: (typeof NAV)[number]) => (
    <Link key={n.to} to={n.to} aria-current={isActive(n.to) ? 'page' : undefined}>
      <n.icon aria-hidden="true" size={18} />
      {n.label}
      {n.to === '/app/notifications' && unread > 0 && <span className="count" aria-label={`${unread} unread`}>{unread}</span>}
    </Link>
  );
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      {data?.profile.isDemo && <div className="demo-banner" role="note">Demo mode — every number here is fictional sample data. <Link to="/signup" style={{ color: 'inherit' }}>Create your own plan</Link></div>}
      <div className="app-shell">
        <aside className="sidebar" aria-label="App navigation">
          <Logo to="/app" />
          <nav className="side-nav" aria-label="Primary">{NAV.map(item)}</nav>
          <nav className="side-nav" aria-label="Account">
            <span className="side-group">Account</span>
            {NAV2.map(item)}
          </nav>
          <div style={{ marginTop: 'auto' }} className="stack stack-sm">
            <p className="xs muted" style={{ padding: '0 12px', wordBreak: 'break-all' }}>{data?.profile.displayName ?? data?.profile.email}</p>
            <button className="btn btn-ghost w-full" style={{ justifyContent: 'flex-start' }} onClick={out}>
              <LuLogOut aria-hidden="true" /> Sign out
            </button>
          </div>
        </aside>
        <div>
          <header className="mobile-top chrome">
            <Logo to="/app" />
            <Link to="/app/notifications" className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
              <LuBell aria-hidden="true" />
            </Link>
          </header>
          <main id="main" className="app-main">
            <div className="inner route" key={loc.path}>{children}</div>
          </main>
        </div>
      </div>
      <nav className="bottom-nav" aria-label="Primary (mobile)">
        {NAV.slice(0, 4).map((n) => (
          <Link key={n.to} to={n.to} aria-current={isActive(n.to) ? 'page' : undefined}>
            <n.icon aria-hidden="true" size={20} />
            {n.label.replace('My ', '')}
          </Link>
        ))}
        <button aria-expanded={more} aria-haspopup="dialog" onClick={() => setMore(true)}>
          <LuEllipsis aria-hidden="true" size={20} />
          More
        </button>
      </nav>
      <Dialog open={more} onClose={() => setMore(false)} title="More">
        <nav className="sheet-list" aria-label="More pages">
          {[...NAV.slice(4), ...NAV2].map((n) => (
            <Link key={n.to} to={n.to} onClick={() => setMore(false)}>
              <n.icon aria-hidden="true" size={20} /> {n.label}
            </Link>
          ))}
          <button onClick={() => (setMore(false), out())}>
            <LuLogOut aria-hidden="true" size={20} /> Sign out
          </button>
        </nav>
      </Dialog>
    </>
  );
}

export function PageHead({ eyebrow, title, intro, actions }: { eyebrow?: string; title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="stack stack-sm">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {intro && <p className="muted" style={{ maxWidth: '62ch' }}>{intro}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}
