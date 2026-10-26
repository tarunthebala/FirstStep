import { useState } from 'react';
import { dateLabel, dateTimeLabel } from '../../shared/format';
import type { Task, TaskStage } from '../../shared/types';
import { Link } from '../lib/router';
import { useAction, useApp } from '../lib/state';
import { PageHead } from '../components/layouts';
import { Button, Empty, PriorityBadge, ProgressBar } from '../components/ui';

const STAGES: { id: TaskStage; title: string; intro: string }[] = [
  { id: 'understand', title: 'Stage 1 · Understand', intro: 'Get the facts straight: your loans, rates, income and expenses.' },
  { id: 'practice', title: 'Stage 2 · Practice', intro: 'Build a budget and rehearse with Money Lab.' },
  { id: 'prepare', title: 'Stage 3 · Prepare', intro: 'Lock in dates and get ready for the first payment.' },
];
const RANK = { high: 0, medium: 1, low: 2 } as const;

export function ActionPlan() {
  const { data, mutate } = useApp();
  const { run, pending } = useAction();
  const tasks = data.tasks.filter((t) => !t.key.startsWith('checklist_'));
  const done = tasks.filter((t) => t.status === 'done').length;
  return (
    <>
      <PageHead
        eyebrow="Your personalized checklist"
        title="Action Plan"
        intro="Tasks come from your confirmed information. Anything that fills in missing or uncertain details comes first. Tasks that don’t apply to you aren’t shown."
        actions={<Button variant="secondary" loading={pending} onClick={() => run(() => mutate('POST', '/api/plan/generate'), 'Plan updated from your latest data.')}>Refresh plan</Button>}
      />
      {tasks.length === 0 ? (
        <Empty title="No plan yet" action={<Link to="/app/review">Review and confirm your summary</Link>}>Your plan is generated after you confirm your financial summary.</Empty>
      ) : (
        <div className="stack stack-lg">
          <div className="panel stack stack-sm">
            <div className="row-between"><strong>Overall progress</strong><span className="num">{done} of {tasks.length} done</span></div>
            <ProgressBar value={(done / tasks.length) * 100} label="Overall action plan progress" />
            {data.plan && <span className="xs muted">Plan generated {dateTimeLabel(data.plan.generatedAt)} from the summary you confirmed.</span>}
          </div>
          {STAGES.map((s) => {
            const list = tasks.filter((t) => t.stage === s.id).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || RANK[a.priority] - RANK[b.priority]);
            if (!list.length) return null;
            const d = list.filter((t) => t.status === 'done').length;
            return (
              <section key={s.id} className="stack" aria-labelledby={`st-${s.id}`}>
                <div className="row-between">
                  <div className="stack stack-sm"><h2 id={`st-${s.id}`} className="h3">{s.title}</h2><p className="small muted">{s.intro}</p></div>
                  <span className="small num">{d}/{list.length}</span>
                </div>
                <ProgressBar value={(d / list.length) * 100} label={`${s.title} progress`} />
                <div className="panel divider-list">{list.map((t) => <TaskRow key={t.id} t={t} />)}</div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function TaskRow({ t }: { t: Task }) {
  const { mutate } = useApp();
  const { run } = useAction();
  const [editDate, setEditDate] = useState(false);
  const done = t.status === 'done';
  return (
    <div className={`task ${done ? 'done' : ''}`}>
      <input type="checkbox" className="task-check" checked={done} aria-label={`Mark “${t.title}” ${done ? 'not done' : 'done'}`} onChange={(e) => run(() => mutate('PATCH', `/api/tasks/${t.id}`, { status: e.target.checked ? 'done' : 'open' }))} />
      <div className="stack stack-sm">
        <strong className="task-title">{t.title}</strong>
        <span className="small muted">{t.reason}</span>
        <div className="row small">
          <Link to={t.link}>Open</Link>
          {editDate ? (
            <input type="date" className="input" style={{ width: 180, minHeight: 34 }} aria-label={`Due date for ${t.title}`} defaultValue={t.dueDate ?? ''} onBlur={(e) => (setEditDate(false), run(() => mutate('PATCH', `/api/tasks/${t.id}`, { dueDate: e.target.value || null })))} autoFocus />
          ) : (
            <button className="btn-link" onClick={() => setEditDate(true)}>{t.dueDate ? `Due ${dateLabel(t.dueDate)}` : 'Add a due date'}</button>
          )}
          {done && t.completedAt && <span className="xs muted">Done {dateLabel(t.completedAt)}</span>}
        </div>
      </div>
      <PriorityBadge priority={t.priority} />
    </div>
  );
}
