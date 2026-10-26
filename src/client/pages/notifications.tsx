import { useEffect } from 'react';
import { LuBell } from 'react-icons/lu';
import { dateTimeLabel } from '../../shared/format';
import { Link } from '../lib/router';
import { useAction, useApp } from '../lib/state';
import { PageHead } from '../components/layouts';
import { Alert, Button, Empty } from '../components/ui';

const KIND_LABEL = { task: 'Task', date: 'Date', onboarding: 'Setup', savings: 'Savings', review: 'Review' } as const;

export function Notifications() {
  const { data, mutate } = useApp();
  const { run, pending } = useAction();
  useEffect(() => {
    mutate('POST', '/api/notifications/refresh').catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const unread = data.notifications.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHead eyebrow="Reminders" title="Notifications" intro="FirstStep reminders based on your tasks and the dates you’ve entered. They are not notices from your loan servicer and can’t guarantee a payment is made." actions={unread > 0 && <Button variant="secondary" loading={pending} onClick={() => run(() => mutate('POST', '/api/notifications/read-all'))}>Mark all read</Button>} />
      <div className="stack">
        {!data.integrations.email && <Alert>Reminders appear here in the app. Email reminders aren’t available because no email provider is configured. <Link to="/app/settings#notifications">Notification settings</Link></Alert>}
        {data.notifications.length === 0 ? <Empty title="You’re all caught up">Reminders show up here as dates and tasks approach.</Empty> : (
          <div className="panel divider-list">
            {data.notifications.map((n) => (
              <div key={n.id} className="task" style={{ opacity: n.readAt ? 0.7 : 1 }}>
                <LuBell aria-hidden="true" size={18} />
                <div className="stack stack-sm">
                  <div className="row"><strong>{n.title}</strong><span className="badge badge-low">{KIND_LABEL[n.kind]}</span>{!n.readAt && <span className="badge badge-connected">New</span>}</div>
                  <span className="small muted">{n.body}</span>
                  <span className="xs muted">{dateTimeLabel(n.createdAt)}</span>
                </div>
                {!n.readAt && <Button size="sm" variant="ghost" onClick={() => run(() => mutate('POST', `/api/notifications/${n.id}/read`))}>Mark read</Button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
