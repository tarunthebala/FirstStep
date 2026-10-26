import { LuArrowRight, LuCalendarClock, LuFlaskConical, LuListChecks, LuBookOpen } from 'react-icons/lu';
import { Link } from '../lib/router';
import { useSession } from '../lib/state';
import { ButtonLink, Ring } from '../components/ui';
import { MiniBars } from '../components/charts';
import { DemoButton } from './auth';

function Preview() {
  // Illustrative only. Every figure below is labeled as such and never tied to a visitor.
  return (
    <figure className="preview" style={{ margin: 0 }} aria-label="Illustrative FirstStep dashboard preview with sample numbers">
      <div className="preview-top">
        <span className="small" style={{ fontWeight: 600 }}>Dashboard</span>
        <span className="badge badge-demo">Illustrative example</span>
      </div>
      <div className="preview-body">
        <div className="stack stack-sm">
          <span className="eyebrow">Est. monthly payment</span>
          <span className="big-num">$238</span>
          <span className="xs muted">Sample: 4 loans, fixed 10-year assumption</span>
        </div>
        <div className="row" style={{ gap: 14 }}>
          <Ring value={64} size={72} label="Sample readiness score" />
          <div className="stack stack-sm">
            <span className="eyebrow">Readiness</span>
            <span className="small muted">Preparation, not credit</span>
          </div>
        </div>
        <div className="span-2 stack stack-sm">
          <div className="row-between">
            <span className="eyebrow">Monthly cash flow · sample</span>
            <span className="small num">+$412</span>
          </div>
          <MiniBars values={[620, 540, 410, -120, 380, 412, 450, 470, 440, 500, 515, 530]} label="Sample monthly cash flow over 12 months, one month negative" />
        </div>
        <div className="stack stack-sm">
          <span className="eyebrow">Emergency savings</span>
          <div className="bar" aria-hidden="true"><span style={{ width: '40%' }} /></div>
          <span className="xs muted">$2,400 of $6,000 sample goal</span>
        </div>
        <div className="stack stack-sm">
          <span className="eyebrow">Next step</span>
          <span className="small" style={{ fontWeight: 600 }}>Confirm your first payment date</span>
          <span className="xs muted">High priority</span>
        </div>
      </div>
    </figure>
  );
}

export function Landing() {
  const { status } = useSession();
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="stack stack-lg">
            <span className="eyebrow">For students and recent graduates</span>
            <h1 className="display">Your first student loan payment shouldn’t be a surprise.</h1>
            <p className="lede">Understand your loans, practice your budget, and prepare for repayment before your grace period ends.</p>
            <div className="row" style={{ gap: 16 }}>
              <ButtonLink to={status === 'authed' ? '/app' : '/signup'} size="lg" arrow>Build My Plan</ButtonLink>
              <Link to="/how-it-works" className="text-link">Explore How It Works ↓</Link>
            </div>
            <p className="small muted">Free to explore. No bank connection required. <DemoButton /></p>
          </div>
          <Preview />
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <span>Know your numbers</span><span>✳</span><span>Practice before it counts</span><span>✳</span><span>Prepare with a plan</span>
      </div>

      <section className="section">
        <div className="container grid-2" style={{ alignItems: 'start' }}>
          <div className="stack">
            <span className="eyebrow">The problem</span>
            <h2>Graduation comes with a bill most people haven’t practiced for.</h2>
          </div>
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {[
              ['Uncertain payments', 'You may not know what you’ll owe each month, or when it starts.'],
              ['An entry-level budget', 'A first salary has to cover rent, insurance, transportation and loans at once.'],
              ['Interest and plan rules', 'Interest, capitalization and repayment plans are confusing, and federal rules changed in 2026.'],
              ['Surprise costs', 'Moving, deposits and a slow job search arrive right when money is tight.'],
              ['An unclear grace period', 'It’s easy to reach the end of it without a plan.'],
            ].map(([t, d]) => (
              <li key={t} className="panel-plain">
                <h3 className="h4">{t}</h3>
                <p className="muted small mt-8">{d}</p>
              </li>
            ))}
            <li className="panel-dark">
              <p><strong>FirstStep turns those unknowns into a plan you can check.</strong> It organizes your real loan data, shows exactly how each estimate is calculated, lets you test what-ifs safely, and gives you a short list of next steps.</p>
            </li>
          </ul>
        </div>
      </section>

      <section className="section band" id="features">
        <div className="container stack stack-lg">
          <div className="stack">
            <span className="eyebrow">What you can do</span>
            <h2 style={{ maxWidth: '18ch' }}>Four ways FirstStep helps you get ready.</h2>
          </div>
          <div className="grid-4">
            {[
              [LuCalendarClock, 'Know Your Numbers', 'Understand your loans, income, expenses, savings, and estimated repayment costs.'],
              [LuFlaskConical, 'Practice Before It Counts', 'Test budgets, delayed employment, unexpected expenses, and alternative financial assumptions.'],
              [LuListChecks, 'Build Your Action Plan', 'Receive a personalized checklist of steps to complete before repayment begins.'],
              [LuBookOpen, 'Learn by Understanding', 'Understand interest, budgeting, repayment options, and financial tradeoffs in plain English.'],
            ].map(([Icon, t, d], i) => {
              const I = Icon as typeof LuBookOpen;
              return (
                <div key={t as string} className="stack feature-card">
                  <span className="row" style={{ justifyContent: 'space-between' }}>
                    <I aria-hidden="true" size={22} />
                    <span className="small muted">0{i + 1}</span>
                  </span>
                  <h3>{t as string}</h3>
                  <p className="muted small">{d as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="container grid-2" style={{ alignItems: 'start' }}>
          <div className="stack">
            <span className="eyebrow">How it works</span>
            <h2>Three steps, in order.</h2>
            <p className="muted">Setup takes about ten minutes. You can save and come back any time.</p>
            <ButtonLink to="/how-it-works" variant="secondary" arrow>See the full walkthrough</ButtonLink>
          </div>
          <ol className="steps-list">
            <li><div><h3 className="h4">Understand your finances</h3><p className="muted small mt-8">Enter your graduation date, upload your StudentAid.gov loan file or add loans by hand, and connect a bank account only if you want to.</p></div></li>
            <li><div><h3 className="h4">Review and confirm</h3><p className="muted small mt-8">Check every number FirstStep organized. Fix what’s wrong. Nothing is used for your plan until you confirm it.</p></div></li>
            <li><div><h3 className="h4">Practice and prepare</h3><p className="muted small mt-8">Get a personalized action plan, then try scenarios in Money Lab without changing your real budget.</p></div></li>
          </ol>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--color-muted-surface)' }}>
        <div className="container stack stack-lg">
          <div className="stack">
            <span className="eyebrow">Trust and privacy</span>
            <h2 style={{ maxWidth: '20ch' }}>You stay in control of your information.</h2>
          </div>
          <div className="grid-3">
            {[
              ['Manual entry always works', 'You can enter everything yourself. Connections are optional.'],
              ['Upload, then review', 'Upload a supported StudentAid.gov file and review every loan before it’s saved.'],
              ['Authorization required', 'Optional connections use the provider’s own secure sign-in. FirstStep never asks for your bank password.'],
              ['You confirm first', 'You review and correct your information before your first plan is built.'],
              ['Simulations move no money', 'Money Lab is practice. It can’t make or schedule payments.'],
              ['Estimates, not statements', 'Your servicer has the official numbers. Disconnect integrations and delete your data any time.'],
            ].map(([t, d]) => (
              <div key={t} className="panel-plain">
                <h3 className="h4">{t}</h3>
                <p className="muted small mt-8">{d}</p>
              </div>
            ))}
          </div>
          <Link to="/privacy" className="text-link">Read how FirstStep handles your data</Link>
        </div>
      </section>

      <section className="section band-gradient">
        <div className="container stack stack-lg">
          <h2 className="display" style={{ color: '#fff', maxWidth: '12ch' }}>Take the first step.</h2>
          <p className="lede" style={{ color: '#eef3ea' }}>Start preparing now, while you still have time to practice.</p>
          <div className="row">
            <ButtonLink to={status === 'authed' ? '/app' : '/signup'} size="lg" variant="secondary" className="on-dark" arrow>Build My Plan</ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}

export function HowItWorks() {
  const steps = [
    ['Tell us when you graduate', 'Your expected or actual graduation date organizes your timeline. FirstStep doesn’t assume a grace period or first payment date from it — those depend on your loans, so we ask you to confirm them with your servicer.'],
    ['Upload your StudentAid.gov loan data', 'Download your aid data file (usually named MyStudentData.txt) from your StudentAid.gov account and upload it. FirstStep reads it on the server, shows you every loan it found and any fields it couldn’t read, and saves nothing until you confirm. You can also add loans by hand, including private loans.'],
    ['Connect accounts, if you want', 'Where the server is configured for it, you can connect a bank account through Plaid’s secure sign-in to organize spending. Direct loan-servicer connections are only offered where the provider supports them. Skipping this step is fine — manual entry works everywhere.'],
    ['Review and confirm your summary', 'FirstStep organizes what you provided into monthly income, expenses, savings and loans, and labels where each number came from. You fix anything that looks wrong, then confirm. Your first plan is built only after this step.'],
    ['Get your personalized plan', 'A snapshot of where you stand, a list of what’s missing, and prioritized tasks that apply to you — each with the reason it’s on your list.'],
    ['Practice in Money Lab', 'Try spending changes, a delayed job start, surprise costs, a practice payment, and different repayment terms. Scenarios are saved separately and never change your real budget.'],
  ];
  return (
    <section className="section">
      <div className="container stack stack-lg">
        <div className="stack">
          <span className="eyebrow">How It Works</span>
          <h1 className="display" style={{ maxWidth: '12ch' }}>From unknowns to a plan.</h1>
          <p className="lede">Understand your finances. Practice realistic scenarios. Prepare with a personalized action plan.</p>
        </div>
        <ol className="steps-list" style={{ maxWidth: 820 }}>
          {steps.map(([t, d]) => (
            <li key={t}>
              <div>
                <h2 className="h3">{t}</h2>
                <p className="muted mt-8">{d}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="row">
          <ButtonLink to="/signup" size="lg" arrow>Build My Plan</ButtonLink>
          <DemoButton variant="secondary" />
        </div>
      </div>
    </section>
  );
}

export function Features() {
  const groups = [
    ['Know Your Numbers', ['Total recorded balance with principal and unpaid interest kept separate', 'Payment estimates calculated loan by loan, with every assumption shown', 'Current and post-graduation cash flow, without double counting loan payments', 'Labels on every value: imported, entered by you, estimated, verified or connected']],
    ['Practice Before It Counts', ['Lifestyle simulator for dining, subscriptions, housing and more', 'Delayed-employment projection with the month savings would run out', 'Unexpected-expense and income-dip tests', 'Practice-payment and repayment-term comparisons', 'Save, rename, duplicate and compare scenarios — your baseline never changes']],
    ['Build Your Action Plan', ['Tasks generated from your confirmed data, not a generic list', 'Missing or uncertain information comes first', 'Due dates only from dates you’ve entered or confirmed', 'In-app reminders you control']],
    ['Learn by Understanding', ['Ten short modules from student loan basics to your first payment', 'Interactive exercises and a knowledge check in each', 'References to Federal Student Aid and the CFPB', 'A learning coach that explains rather than decides']],
  ] as const;
  return (
    <section className="section">
      <div className="container stack stack-lg">
        <div className="stack">
          <span className="eyebrow">Features</span>
          <h1 className="display" style={{ maxWidth: '13ch' }}>Built for the months before repayment.</h1>
        </div>
        <div className="grid-2">
          {groups.map(([t, items], i) => (
            <div key={t} className="feature stack">
              <span className="idx">0{i + 1}</span>
              <h2 className="h3">{t}</h2>
              <ul className="stack stack-sm" style={{ paddingLeft: 18, margin: 0 }}>
                {items.map((x) => <li key={x} className="muted">{x}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="panel-muted row-between">
          <p style={{ maxWidth: '60ch' }}><strong>What FirstStep doesn’t do:</strong> it doesn’t move money, make loan payments, decide which repayment plan you qualify for, or replace your loan servicer.</p>
          <ButtonLink to="/signup" arrow>Get Started</ButtonLink>
        </div>
      </div>
    </section>
  );
}

export function About() {
  return (
    <section className="section">
      <div className="container prose">
        <span className="eyebrow">About</span>
        <h1>Help students prepare for repayment with confidence.</h1>
        <p className="lede">FirstStep helps college students understand their student loans, practice managing their money, and prepare for repayment before it starts.</p>
        <p>Most people meet their student loan bill for the first time when it’s due. FirstStep gives you a place to see your numbers, understand where they come from, and practice decisions before they have real consequences.</p>
        <p>FirstStep is an educational planning tool. It is not a lender, a loan servicer, a government agency or a financial advisor, and it isn’t affiliated with any of them. Where official rules matter, it points you to Federal Student Aid, the Consumer Financial Protection Bureau, or your servicer.</p>
        <p><Link to="/how-it-works">See how it works <LuArrowRight aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} /></Link></p>
      </div>
    </section>
  );
}

export function Privacy() {
  return (
    <section className="section">
      <div className="container prose">
        <span className="eyebrow">Privacy and Security</span>
        <h1>How FirstStep handles your information</h1>
        <p className="lede">Financial information is sensitive. FirstStep collects what it needs to work, shows you what it stores, and lets you correct, export or delete it.</p>
        <h2>What we store and why</h2>
        <ul>
          <li><strong>Account:</strong> your email and a securely hashed password (or your auth provider’s session) so you can sign in.</li>
          <li><strong>Profile:</strong> graduation date and status, optional school, employment status — used to build your timeline and tasks.</li>
          <li><strong>Loans:</strong> the loan details you upload, connect or enter. From a StudentAid.gov file, FirstStep keeps loan fields only and discards your name, address, phone and email from the file.</li>
          <li><strong>Budget:</strong> income, expenses, savings and goals you enter or confirm.</li>
          <li><strong>Connected-account data</strong> (only if you connect): account names, balances and transactions used to suggest budget categories.</li>
          <li><strong>Plans and scenarios:</strong> your confirmed summaries, generated plans, tasks, saved Money Lab scenarios and learning progress.</li>
        </ul>
        <h2>Uploaded files</h2>
        <p>Uploads must be .txt files under 1 MB. They are checked and parsed on the server in memory, never written to disk as files, and their contents are not logged. Nothing from an upload is saved to your loans until you review and confirm it.</p>
        <h2>Connected accounts</h2>
        <p>Connections use Plaid’s authorization flow. You sign in to your institution through Plaid, never through FirstStep, and FirstStep never sees your bank password. The access credential Plaid issues is encrypted (AES-256-GCM) and kept server-side only. You choose which accounts are included, and you can disconnect at any time; disconnecting revokes access with Plaid and deletes FirstStep’s copy of the credential. You choose whether imported transactions are kept or deleted.</p>
        <h2>Learning coach</h2>
        <p>The Money Lab coach answers from explanations written in advance, using your own FirstStep numbers. Questions you ask it are not sent to any outside service.</p>
        <h2 id="security">Security</h2>
        <ul>
          <li>Every request for your data is checked on the server against your signed-in session. With the Supabase deployment, the database also enforces row-level security so each person can only read their own rows.</li>
          <li>Session cookies are HTTP-only and same-site. Changes require a request header browsers won’t send from other sites.</li>
          <li>Secrets and privileged keys stay on the server and are never sent to your browser.</li>
          <li>Error logs record what failed, not the financial data involved.</li>
        </ul>
        <p>FirstStep does not claim any security certification or regulatory compliance status.</p>
        <h2>Your controls</h2>
        <p>In Settings you can review and correct your information, export everything as a file, disconnect integrations, and permanently delete your account and data.</p>
      </div>
    </section>
  );
}

export function Terms() {
  return (
    <section className="section">
      <div className="container prose">
        <span className="eyebrow">Terms of Use</span>
        <h1>Terms of Use</h1>
        <p className="muted small">These terms are a plain-language template for this project and should be reviewed by a lawyer before a public launch.</p>
        <h2>Educational tool, not advice</h2>
        <p>FirstStep provides educational planning tools and estimates. It does not provide financial, legal or tax advice, and it does not guarantee any financial outcome.</p>
        <h2>Estimates are not official</h2>
        <p>Balances, payments, dates and other figures in FirstStep are estimates based on information you provide or authorize. Your loan servicer and StudentAid.gov are the official sources. Always confirm before making decisions.</p>
        <h2>No payments or transfers</h2>
        <p>FirstStep cannot make, schedule or guarantee loan payments or move money. Reminders are not notices from your servicer.</p>
        <h2>Your responsibilities</h2>
        <p>Keep your sign-in secure, provide information you have the right to share, and review imported or suggested values before relying on them.</p>
        <h2>Third-party services</h2>
        <p>Optional connections are provided by third parties under their own terms. FirstStep is not affiliated with any government agency, lender, servicer, bank or school.</p>
        <h2>Ending your account</h2>
        <p>You can delete your account at any time in Settings.</p>
      </div>
    </section>
  );
}

export function Help() {
  const faq: [string, string][] = [
    ['Do I have to connect my bank?', 'No. Every part of FirstStep works with information you enter yourself. Connections are optional.'],
    ['Where do I get my StudentAid.gov file?', 'Sign in at StudentAid.gov and open your aid summary (school guides describe it under “My Aid”). Look for the option to download your aid data — it saves a text file, usually named MyStudentData.txt. StudentAid.gov changes its layout from time to time; if you can’t find the option, use their help center or add your loans by hand.'],
    ['Is my estimated payment what I’ll actually pay?', 'Not necessarily. FirstStep calculates an estimate from your recorded balances and rates, using a fixed schedule unless you set a different term. Your servicer sets the real payment based on your plan. Every estimate has a “How is this calculated?” section.'],
    ['Why doesn’t FirstStep tell me my first payment date?', 'Grace periods and first payment dates depend on the loan type and your circumstances. FirstStep won’t guess. Find the official date in your servicer account and add it — it’ll then appear on your timeline and reminders.'],
    ['Does Money Lab change my budget?', 'No. Scenarios are stored separately. Your saved budget only changes when you edit it in My Finances or the review screen.'],
    ['What is the readiness score?', 'A 0–100 measure of preparation in four equal parts: understanding and verifying your loans, reviewing your income and budget, building a repayment strategy, and keeping up weekly money habits. Points come only from information you save and steps you complete — never from logging in — and weekly habits never expire, so missing a week won’t lower your score. Reaching 100% means you’ve finished FirstStep’s preparation checklist. It isn’t a credit score, a guarantee you can afford payments, or a judgment of you.'],
    ['Can I fix something after I confirmed my summary?', 'Yes. Open “Review my data” in the app any time, correct it, and confirm again to refresh your plan.'],
    ['How do I delete my data?', 'Settings → Delete account. It removes your account and all of your FirstStep data. You can export a copy first.'],
    ['Is FirstStep affiliated with the government or my servicer?', 'No. FirstStep is independent and is not an official source for your loans.'],
  ];
  return (
    <section className="section">
      <div className="container stack stack-lg" style={{ maxWidth: 860 }}>
        <div className="stack">
          <span className="eyebrow">Help and FAQ</span>
          <h1>Questions, answered.</h1>
        </div>
        <div className="faq">
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <div>{a}</div>
            </details>
          ))}
        </div>
        <div className="panel-muted stack stack-sm">
          <h2 className="h4">Need official help with your loans?</h2>
          <p className="small">Contact your loan servicer, or visit <a href="https://studentaid.gov/manage-loans/repayment/servicers" target="_blank" rel="noreferrer">StudentAid.gov’s servicer page</a> to find out who yours is.</p>
        </div>
      </div>
    </section>
  );
}

export function NotFound() {
  return (
    <section className="section">
      <div className="container stack">
        <span className="eyebrow">404</span>
        <h1>That page doesn’t exist.</h1>
        <p className="muted">The link may be old or mistyped.</p>
        <div className="row">
          <ButtonLink to="/">Go home</ButtonLink>
          <ButtonLink to="/help" variant="secondary">Help</ButtonLink>
        </div>
      </div>
    </section>
  );
}
