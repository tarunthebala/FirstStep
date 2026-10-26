import { useEffect, useMemo, useRef, useState } from 'react';
import { LuArrowRight, LuCheck, LuCircle, LuX } from 'react-icons/lu';
import { dateLabel, todayISO } from '../../shared/format';
import {
  celebrations,
  HABIT_POINTS_EACH,
  HABIT_POINTS_MAX,
  HABITS,
  HABITS_COUNTED_PER_WEEK,
  MILESTONE_MESSAGE,
  MILESTONES,
  milestoneReached,
  nextMilestone,
  nextWin,
  tierFor,
  weekStartOf,
  type HabitKey,
  type ReadinessResult,
} from '../../shared/readiness';
import { Link } from '../lib/router';
import { prefersReducedMotion, Spring, SPRING } from '../lib/spring';
import { useAction, useApp, useToast } from '../lib/state';
import { Alert, ButtonLink } from './ui';

const TIER_LABEL = { 25: 'Building momentum', 50: 'Making real progress', 75: 'Almost there', 100: 'Ready for your next step' } as const;

function readLast(key: string): number | null {
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}
function writeLast(key: string, v: number) {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* storage unavailable — animation just starts from zero next time */
  }
}

/** The Financial Readiness Meter. Everything shown comes from the user's saved data. */
export function ReadinessMeter({ readiness }: { readiness: ReadinessResult }) {
  const { data, mutate } = useApp();
  const { score, meaningful, categories } = readiness;
  const tier = tierFor(score);
  const win = nextWin(readiness);
  const next = nextMilestone(score);
  const reached = milestoneReached(score);
  const celebrated = data.engagement?.celebratedMilestone ?? 0;
  const [celebrating, setCelebrating] = useState<number | null>(null);
  const [showHow, setShowHow] = useState(false);
  const numberEl = useRef<HTMLSpanElement>(null);
  const fillEl = useRef<HTMLSpanElement>(null);
  const spring = useRef<Spring | null>(null);
  const storeKey = `fs-readiness-last-${data.profile.id}`;

  // Animate from the last value this browser showed, so return visits only animate what changed.
  useEffect(() => {
    if (!meaningful) return;
    const apply = (v: number) => {
      const clamped = Math.max(0, Math.min(100, v));
      if (numberEl.current) numberEl.current.textContent = String(Math.round(clamped));
      if (fillEl.current) fillEl.current.style.transform = `scaleX(${clamped / 100})`;
    };
    spring.current ??= new Spring(readLast(storeKey) ?? 0, apply);
    if (prefersReducedMotion()) spring.current.set(score);
    else {
      spring.current.set(spring.current.value);
      spring.current.to(score, { dampingRatio: 1, response: 0.9 });
    }
    writeLast(storeKey, score);
    return () => spring.current?.stop();
  }, [score, meaningful, storeKey]);

  // Celebrate a newly reached milestone once; the server verifies it and remembers it.
  useEffect(() => {
    if (!meaningful || !data.engagement || reached <= celebrated) return;
    setCelebrating(reached);
    mutate('POST', '/api/engagement/celebrate', { milestone: reached }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reached, celebrated, meaningful]);

  if (!data.engagement)
    return (
      <section className="meter meter-skeleton" aria-busy="true" aria-label="Loading your financial readiness">
        <span className="skeleton" style={{ width: '40%', height: 18 }} />
        <span className="skeleton" style={{ width: '70%', height: 34 }} />
        <span className="skeleton" style={{ width: '100%', height: 12 }} />
      </section>
    );

  if (!meaningful)
    return (
      <section className="meter" aria-labelledby="meter-h">
        <div className="meter-main">
          <span className="eyebrow">Financial readiness · Let’s get started</span>
          <h2 id="meter-h" className="meter-headline">{tierFor(0).headline}</h2>
          <p className="meter-message">There isn’t enough information yet to measure your readiness. Your score will start building as soon as you add your first loan or your income. Here’s the best place to begin.</p>
        </div>
        <NextWinCard win={win} />
      </section>
    );

  return (
    <section className={`meter ${celebrating ? 'meter-celebrate' : ''}`} aria-labelledby="meter-h">
      <div className="meter-main">
        <div className="meter-score-row">
          <div className="meter-score" aria-hidden="true">
            <span ref={numberEl}>{score}</span>
            <span className="meter-pct">%</span>
          </div>
          <div className="stack stack-sm">
            <span className="eyebrow">Financial readiness · {tier.label}</span>
            <h2 id="meter-h" className="meter-headline">{tier.headline}</h2>
          </div>
        </div>
        <p className="meter-message">{tier.message}</p>

        <div className="meter-track-wrap">
          <div className="meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-valuetext={`${score}% ready — ${tier.label}`} aria-label="Financial readiness">
            <span className="meter-fill" ref={fillEl} style={{ transform: `scaleX(${(readLast(storeKey) ?? 0) / 100})` }} />
            {celebrating && <span className="meter-sheen" aria-hidden="true" />}
          </div>
          <ol className="meter-milestones" aria-label="Milestones">
            {MILESTONES.map((m) => (
              <li key={m} className={score >= m ? 'reached' : ''} style={{ left: `${m}%` }}>
                <span className="tick" aria-hidden="true" />
                <span className="ml">{m}%</span>
                <span className="sr-only">{score >= m ? ' reached' : ' not reached yet'}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="meter-next small">
          {next ? (
            <>
              <strong>{next.pointsAway} {next.pointsAway === 1 ? 'point' : 'points'}</strong> to {next.milestone}% · {TIER_LABEL[next.milestone as keyof typeof TIER_LABEL]}
            </>
          ) : (
            <>Every milestone reached. Reaching 100% means your FirstStep preparation checklist is complete — it isn’t a promise about payments or outcomes.</>
          )}
        </p>

        <div aria-live="polite">
          {celebrating && (
            <div className="milestone-card" role="status">
              <span className="milestone-badge" aria-hidden="true">{celebrating}%</span>
              <div className="stack stack-sm">
                <strong>Milestone reached: {celebrating}% ready</strong>
                <span className="small">{MILESTONE_MESSAGE}</span>
              </div>
              <button className="icon-btn" aria-label="Close milestone message" onClick={() => setCelebrating(null)}>
                <LuX aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      <NextWinCard win={win} />

      <div className="meter-how">
        <button className="btn-link small" aria-expanded={showHow} aria-controls="score-breakdown" onClick={() => setShowHow((s) => !s)}>
          {showHow ? 'Hide how your score works' : 'How your score works'}
        </button>
        {showHow && (
          <div id="score-breakdown" className="score-grid">
            {categories.map((c) => (
              <div key={c.key} className="score-cat">
                <div className="row-between small"><strong>{c.label}</strong><span className="num">{Math.floor(c.points)} / {c.max}</span></div>
                <div className="bar" aria-hidden="true"><span style={{ width: `${(c.points / c.max) * 100}%` }} /></div>
                <ul className="score-items">
                  {c.items.map((i) => (
                    <li key={i.key} className={i.done ? 'done' : ''}>
                      {i.done ? <LuCheck aria-hidden="true" size={14} /> : <LuCircle aria-hidden="true" size={12} />}
                      <span>{i.label}</span>
                      <span className="num muted">{Math.floor(i.points)}/{i.max}</span>
                      <span className="sr-only">{i.done ? 'done' : 'not done yet'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="xs muted" style={{ gridColumn: '1 / -1' }}>
              Points come only from information you’ve saved and steps you’ve completed — never from logging in. Weekly habits count once each per week (up to {HABITS_COUNTED_PER_WEEK} a week) and never expire, so missing a week won’t lower your score. This isn’t a credit score or a guarantee you can afford payments.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function NextWinCard({ win }: { win: ReturnType<typeof nextWin> }) {
  return (
    <aside className="next-win" aria-labelledby="next-win-h">
      <span className="eyebrow">Your next win</span>
      <h3 id="next-win-h" className="h4">{win.title}</h3>
      <p className="small">{win.detail}</p>
      <div className="row-between">
        <ButtonLink to={win.link} size="sm">{win.cta} <LuArrowRight aria-hidden="true" /></ButtonLink>
        {win.gain > 0 && <span className="win-gain">Up to +{Math.ceil(win.gain)} points</span>}
      </div>
    </aside>
  );
}

/** Short, positive notes about real accomplishments. Dismissals are remembered. */
export function CelebrationBanner() {
  const { data, mutate } = useApp();
  const list = useMemo(
    () =>
      data.engagement
        ? celebrations({ today: todayISO(), habits: data.habits, scenarios: data.scenarios, summary: data.summary, lastSeenAt: data.engagement.lastSeenAt, previousSeenAt: data.engagement.previousSeenAt, dismissed: data.engagement.dismissed })
        : [],
    [data],
  );
  const first = list[0];
  if (!first) return null;
  return (
    <div className="celebrate" role="status">
      <span className="celebrate-mark" aria-hidden="true"><LuCheck size={16} /></span>
      <p>{first.text}</p>
      <button className="icon-btn" aria-label="Dismiss message" onClick={() => mutate('POST', '/api/engagement/dismiss', { key: first.key }).catch(() => undefined)}>
        <LuX aria-hidden="true" />
      </button>
    </div>
  );
}

/** Lightweight weekly habit tracker. Credit is for doing the habit, never for opening the app. */
export function HabitTracker() {
  const { data, mutate } = useApp();
  const toast = useToast();
  const { run, error, setError } = useAction();
  const today = todayISO();
  const week = weekStartOf(today);
  const doneThisWeek = new Set(data.habits.filter((h) => h.weekStart === week).map((h) => h.habitKey));
  const earned = Math.min(HABIT_POINTS_MAX, (() => {
    const per = new Map<string, Set<string>>();
    for (const h of data.habits) (per.get(h.weekStart) ?? per.set(h.weekStart, new Set()).get(h.weekStart)!).add(h.habitKey);
    let p = 0;
    per.forEach((s) => (p += Math.min(s.size, HABITS_COUNTED_PER_WEEK) * HABIT_POINTS_EACH));
    return p;
  })());
  const applicable = (needs: string | null) => (needs === 'loans' ? data.loans.length > 0 : needs === 'plan' ? !!data.plan : true);
  const toggle = (key: HabitKey, done: boolean) =>
    run(async () => {
      const before = doneThisWeek.size;
      await mutate('PUT', `/api/habits/${key}`, { done, today });
      if (done && before === 2) toast('Three habits completed this week. You’re building real momentum.');
      else if (done) toast('Habit done. Nice work.');
    });
  const nextMonday = new Date(`${week}T12:00:00Z`);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  return (
    <section id="habits" className="panel stack" aria-labelledby="habits-h">
      <div className="panel-head" style={{ marginBottom: 0 }}>
        <div className="stack stack-sm">
          <h2 id="habits-h" className="h3">This week’s money habits</h2>
          <span className="xs muted">Week of {dateLabel(week)} · new week starts {dateLabel(nextMonday.toISOString().slice(0, 10))}</span>
        </div>
        <span className="habit-count" aria-label={`${doneThisWeek.size} of ${HABITS.length} habits done this week`}>{doneThisWeek.size}<span>/{HABITS.length}</span></span>
      </div>
      {error && <Alert kind="error" onDismiss={() => setError(null)}>{error}</Alert>}
      <ul className="habit-list">
        {HABITS.map((h) => {
          const done = doneThisWeek.has(h.key);
          const ok = applicable(h.needs);
          return (
            <li key={h.key} className={`habit ${done ? 'done' : ''} ${ok ? '' : 'na'}`}>
              <button className="habit-toggle" aria-pressed={done} disabled={!ok} onClick={() => toggle(h.key, !done)} aria-label={`${h.label}: ${done ? 'done this week, select to undo' : 'mark done this week'}`}>
                {done ? <LuCheck aria-hidden="true" size={16} /> : null}
              </button>
              <div className="stack" style={{ ['--gap' as string]: '2px', flex: 1, minWidth: 0 }}>
                <span className="habit-label">{h.label}</span>
                {!ok && <span className="xs muted">{h.needs === 'loans' ? 'Available once you add a loan' : 'Available once your plan is built'}</span>}
              </div>
              {ok && <Link to={h.link} className="small">Go</Link>}
            </li>
          );
        })}
      </ul>
      <p className="xs muted">
        Habit points: {earned} of {HABIT_POINTS_MAX}. Each habit counts once a week, up to {HABITS_COUNTED_PER_WEEK} a week. Points you’ve earned stay earned, even if you skip a week.
      </p>
    </section>
  );
}

/** Records this visit (for a "welcome back" note). Not used for scoring. */
export function useVisit() {
  const { mutate } = useApp();
  useEffect(() => {
    mutate('POST', '/api/engagement/seen').catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

