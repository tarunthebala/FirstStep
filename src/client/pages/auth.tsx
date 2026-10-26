import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { Link, navigate, useLocation } from '../lib/router';
import { useAction, useSession } from '../lib/state';
import { Alert, Button, Field } from '../components/ui';

function AuthShell({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-side">
        <p className="display" style={{ fontSize: 'clamp(40px,5vw,64px)', maxWidth: '10ch' }}>One step at a time.</p>
        <p style={{ marginTop: 16, maxWidth: '36ch', color: '#eef3ea' }}>Understand your loans, practice your budget, and prepare for repayment before your grace period ends.</p>
      </div>
      <div className="auth-main">
        <div className="auth-card stack stack-lg">
          <div className="stack stack-sm">
            <h1 className="h2">{title}</h1>
            {intro && <p className="muted">{intro}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function DemoButton({ variant }: { variant?: 'secondary' }) {
  const { integrations, refreshSession } = useSession();
  const { run, pending } = useAction();
  if (integrations && !integrations.demo) return null;
  const start = () =>
    run(async () => {
      const r = await api<{ next: string }>('POST', '/api/demo/start');
      await refreshSession();
      navigate(r.next);
    });
  if (variant === 'secondary')
    return (
      <Button variant="secondary" size="lg" onClick={start} loading={pending}>
        Explore the demo
      </Button>
    );
  return (
    <button className="btn-link" onClick={start} disabled={pending}>
      {pending ? 'Opening demo…' : 'Or explore a demo with fictional data.'}
    </button>
  );
}

export function Signup() {
  const { refreshSession } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [verify, setVerify] = useState(false);
  const { run, pending, error } = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = 'Enter a valid email address.';
    if (password.length < 8) errs.password = 'Use at least 8 characters.';
    if (!agree) errs.agree = 'Please accept the terms to continue.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    await run(async () => {
      const r = await api<{ needsVerification: boolean; next?: string }>('POST', '/api/auth/signup', { email, password, displayName: name || undefined });
      if (r.needsVerification) return setVerify(true);
      await refreshSession();
      navigate(r.next ?? '/onboarding/graduation');
    });
  };
  if (verify)
    return (
      <AuthShell title="Check your email" intro={`We sent a confirmation link to ${email}. Open it, then log in to start your plan.`}>
        <Link to="/login">Go to log in</Link>
      </AuthShell>
    );
  return (
    <AuthShell title="Create your account" intro="It takes about ten minutes to build your first plan. You can save and come back.">
      <form className="stack" onSubmit={submit} noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="First name" optional>{(p) => <input {...p} className="input" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}</Field>
        <Field label="Email" error={errors.email}>{(p) => <input {...p} className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
        <Field label="Password" help="At least 8 characters." error={errors.password}>{(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} aria-invalid={!!errors.agree} />
          <span>I agree to the <Link to="/terms">Terms of Use</Link> and understand FirstStep gives estimates, not official loan information. <Link to="/privacy">Privacy</Link>.</span>
        </label>
        {errors.agree && <span className="error-text">{errors.agree}</span>}
        <Button type="submit" size="lg" loading={pending} arrow className="w-full">Create account</Button>
        <p className="small muted">Already have an account? <Link to="/login">Log in</Link></p>
        <p className="small muted"><DemoButton /></p>
      </form>
    </AuthShell>
  );
}

export function Login() {
  const { refreshSession } = useSession();
  const { search } = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { run, pending, error } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await api<{ next: string }>('POST', '/api/auth/login', { email, password });
      await refreshSession();
      const want = search.get('next');
      // Resume onboarding if incomplete; otherwise honor the page they were trying to reach.
      navigate(r.next !== '/app' ? r.next : want && want.startsWith('/app') ? want : '/app');
    });
  };
  return (
    <AuthShell title="Welcome back" intro="Log in to pick up where you left off.">
      <form className="stack" onSubmit={submit}>
        {search.get('signedOut') && <Alert kind="success">You’ve signed out.</Alert>}
        {search.get('reset') && <Alert kind="success">Password updated. Log in with your new password.</Alert>}
        {search.get('verified') && <Alert kind="success">Email confirmed. Log in to continue.</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Email">{(p) => <input {...p} className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
        <Field label="Password">{(p) => <input {...p} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
        <Button type="submit" size="lg" loading={pending} className="w-full">Log in</Button>
        <div className="row-between small">
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/signup">Create an account</Link>
        </div>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<null | { localDriver: boolean }>(null);
  const { run, pending, error } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => setSent(await api('POST', '/api/auth/reset-request', { email })));
  };
  return (
    <AuthShell title="Reset your password" intro="Enter your account email and we’ll send a reset link.">
      {sent ? (
        <div className="stack">
          <Alert kind="success">If an account exists for {email}, a reset link is on its way. It expires in one hour.</Alert>
          {sent.localDriver && <Alert kind="info" title="Running locally">No email provider is configured, so the reset link is printed in the server console instead of emailed.</Alert>}
          <Link to="/login">Back to log in</Link>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="Email">{(p) => <input {...p} className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
          <Button type="submit" loading={pending} className="w-full">Send reset link</Button>
          <Link to="/login" className="small">Back to log in</Link>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const { search } = useLocation();
  // Local driver: ?token=…  Supabase: #access_token=…&type=recovery
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const token = search.get('token') ?? (hash.get('type') === 'recovery' ? hash.get('access_token') : null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const { run, pending, error } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setMismatch(true);
    setMismatch(false);
    run(async () => {
      await api('POST', '/api/auth/reset', { token, password });
      navigate('/login?reset=1');
    });
  };
  if (!token)
    return (
      <AuthShell title="Reset link missing" intro="Open the link from your reset email, or request a new one.">
        <Link to="/forgot-password">Request a new link</Link>
      </AuthShell>
    );
  return (
    <AuthShell title="Choose a new password">
      <form className="stack" onSubmit={submit}>
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="New password" help="At least 8 characters.">{(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />}</Field>
        <Field label="Confirm new password" error={mismatch ? 'Passwords don’t match.' : null}>{(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />}</Field>
        <Button type="submit" loading={pending} className="w-full">Update password</Button>
      </form>
    </AuthShell>
  );
}
