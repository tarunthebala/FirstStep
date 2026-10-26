import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { match, navigate, RouterProvider, useLocation } from './lib/router';
import { SessionProvider, ToastProvider, useSession } from './lib/state';
import { AppLayout, PublicLayout } from './components/layouts';
import { Spinner } from './components/ui';
import { About, Features, Help, HowItWorks, Landing, NotFound, Privacy, Terms } from './pages/public';
import { ForgotPassword, Login, ResetPassword, Signup } from './pages/auth';
import { ConnectStep, GraduationStep, LoansStep, PlanStep, ReviewStep } from './pages/onboarding';
import { Dashboard } from './pages/dashboard';
import { Finances } from './pages/finances';
import { MoneyLab } from './pages/moneylab';
import { LoanPlanner } from './pages/planner';
import { ActionPlan } from './pages/actionplan';
import { LearnIndex, LearnModulePage } from './pages/learn';
import { Notifications } from './pages/notifications';
import { DataReview, History, Saved, Settings } from './pages/settings';

function Loading() {
  return (
    <div className="loading-screen">
      <Spinner label="Loading FirstStep" />
    </div>
  );
}

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return <Loading />;
}

/** Pages that work before setup is finished. Everything else under /app needs a confirmed plan. */
const ALLOWED_DURING_SETUP = ['/app/settings', '/app/learn', '/app/notifications', '/app/history', '/app/saved'];

function nextStep(data: NonNullable<ReturnType<typeof useSession>['data']>) {
  const s = data.onboarding.steps;
  return s.graduation !== 'completed' ? '/onboarding/graduation' : !['completed', 'skipped'].includes(s.loans) ? '/onboarding/loans' : !['completed', 'skipped'].includes(s.connections) ? '/onboarding/connect' : s.summary !== 'completed' ? '/onboarding/review' : '/onboarding/plan';
}

function ResumeOnboarding() {
  const { data } = useSession();
  return <Redirect to={data ? nextStep(data) : '/onboarding/graduation'} />;
}

function Authed({ children, path }: { children: ReactNode; path: string }) {
  const { status, data } = useSession();
  if (status === 'loading') return <Loading />;
  if (status === 'anon') return <Redirect to={`/login?next=${encodeURIComponent(path)}`} />;
  if (!data) return <Loading />;
  const setupDone = !!data.onboarding.completedAt || data.onboarding.steps.plan === 'completed';
  if (!setupDone && path.startsWith('/app') && !ALLOWED_DURING_SETUP.some((p) => path.startsWith(p))) {
    return <Redirect to={nextStep(data)} />;
  }
  return <>{children}</>;
}

function Routes() {
  const { path } = useLocation();
  const pub = (el: ReactNode) => <PublicLayout>{el}</PublicLayout>;
  const app = (el: ReactNode) => (
    <Authed path={path}>
      <AppLayout>{el}</AppLayout>
    </Authed>
  );
  const onb = (el: ReactNode) => <Authed path={path}>{el}</Authed>;

  const table: [string, () => ReactNode][] = [
    ['/', () => pub(<Landing />)],
    ['/how-it-works', () => pub(<HowItWorks />)],
    ['/features', () => pub(<Features />)],
    ['/about', () => pub(<About />)],
    ['/privacy', () => pub(<Privacy />)],
    ['/terms', () => pub(<Terms />)],
    ['/help', () => pub(<Help />)],
    ['/learn', () => pub(<LearnIndex publicView />)],
    ['/learn/:id', () => pub(<LearnModulePage id={match('/learn/:id', path)!.id} publicView />)],
    ['/signup', () => pub(<Signup />)],
    ['/login', () => pub(<Login />)],
    ['/forgot-password', () => pub(<ForgotPassword />)],
    ['/reset-password', () => pub(<ResetPassword />)],
    ['/onboarding', () => onb(<ResumeOnboarding />)],
    ['/onboarding/graduation', () => onb(<GraduationStep />)],
    ['/onboarding/loans', () => onb(<LoansStep />)],
    ['/onboarding/connect', () => onb(<ConnectStep />)],
    ['/onboarding/review', () => onb(<ReviewStep />)],
    ['/onboarding/plan', () => onb(<PlanStep />)],
    ['/app', () => app(<Dashboard />)],
    ['/app/finances', () => app(<Finances />)],
    ['/app/money-lab', () => app(<MoneyLab />)],
    ['/app/loan-planner', () => app(<LoanPlanner />)],
    ['/app/plan', () => app(<ActionPlan />)],
    ['/app/learn', () => app(<LearnIndex />)],
    ['/app/learn/:id', () => app(<LearnModulePage id={match('/app/learn/:id', path)!.id} />)],
    ['/app/notifications', () => app(<Notifications />)],
    ['/app/settings', () => app(<Settings />)],
    ['/app/review', () => app(<DataReview />)],
    ['/app/history', () => app(<History />)],
    ['/app/saved', () => app(<Saved />)],
  ];
  for (const [p, render] of table) if (match(p, path)) return <>{render()}</>;
  return pub(<NotFound />);
}

// Floating chrome shows its soft edge only once content actually scrolls beneath it.
const onScroll = () => {
  if (window.scrollY > 4) document.documentElement.setAttribute('data-scrolled', '');
  else document.documentElement.removeAttribute('data-scrolled');
};
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('fs:navigate', () => requestAnimationFrame(onScroll));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider>
      <ToastProvider>
        <SessionProvider>
          <Routes />
        </SessionProvider>
      </ToastProvider>
    </RouterProvider>
  </StrictMode>,
);
