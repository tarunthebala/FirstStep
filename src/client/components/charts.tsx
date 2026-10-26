import { money } from '../../shared/format';
import { tokens } from '../../shared/theme';
import type { MonthRow } from '../../shared/finance';

const C = tokens.chart;

function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

/** Grouped bars: income vs expenses (and optional loan payment) per column, with a text summary. */
export function CashFlowBars({ columns, title }: { columns: { label: string; income: number | null; expenses: number | null; loan?: number | null }[]; title: string }) {
  const max = niceMax(Math.max(1, ...columns.flatMap((c) => [c.income ?? 0, (c.expenses ?? 0) + (c.loan ?? 0)])));
  const W = 520;
  const H = 220;
  const top = 12;
  const bottom = 34;
  const left = 56;
  const plotH = H - top - bottom;
  const groupW = (W - left - 8) / columns.length;
  const barW = Math.min(56, groupW / 3);
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  return (
    <figure className="stack stack-sm" style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - 8} y1={y(t)} y2={y(t)} stroke={tokens.border.default} />
            <text x={left - 8} y={y(t) + 4} textAnchor="end">{money(t, { whole: true })}</text>
          </g>
        ))}
        {columns.map((c, i) => {
          const gx = left + i * groupW + groupW / 2;
          const inc = c.income ?? 0;
          const exp = c.expenses ?? 0;
          const loan = c.loan ?? 0;
          return (
            <g key={c.label}>
              {c.income !== null && <rect rx={4} x={gx - barW - 3} y={y(inc)} width={barW} height={plotH + top - y(inc)} fill={C.income} />}
              {c.expenses !== null && <rect rx={4} x={gx + 3} y={y(exp)} width={barW} height={plotH + top - y(exp)} fill={C.expenses} />}
              {loan > 0 && <rect x={gx + 3} y={y(exp + loan)} width={barW} height={y(exp) - y(exp + loan)} fill={C.loan} stroke="#fff" strokeWidth="1" />}
              <text x={gx} y={H - 12} textAnchor="middle" style={{ fontSize: 12, fill: tokens.text.primary }}>{c.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend" aria-hidden="true">
        <span><i style={{ background: C.income }} />Income</span>
        <span><i style={{ background: C.expenses }} />Expenses</span>
        {columns.some((c) => (c.loan ?? 0) > 0) && <span><i style={{ background: C.loan }} />Estimated loan payment</span>}
      </div>
      <figcaption className="sr-only">
        {columns.map((c) => `${c.label}: income ${money(c.income)}, expenses ${money(c.expenses)}${c.loan ? `, loan payment ${money(c.loan)}` : ''}.`).join(' ')}
      </figcaption>
    </figure>
  );
}

/** Month-by-month projected savings. Shortfall drops below the axis in the error color with a hatched pattern. */
export function ProjectionChart({ rows, title, startingSavings }: { rows: MonthRow[]; title: string; startingSavings: number }) {
  const W = 560;
  const H = 240;
  const left = 60;
  const top = 14;
  const bottom = 30;
  const maxUp = niceMax(Math.max(startingSavings, ...rows.map((r) => r.balance), 1));
  const maxDown = Math.max(0, ...rows.map((r) => r.shortfall));
  const downScale = maxDown > 0 ? niceMax(maxDown) : 0;
  const total = maxUp + downScale;
  const plotH = H - top - bottom;
  const zeroY = top + (maxUp / total) * plotH;
  const yUp = (v: number) => zeroY - (v / total) * plotH;
  const yDown = (v: number) => zeroY + (v / total) * plotH;
  const bw = (W - left - 8) / rows.length;
  const first = rows.find((r) => r.shortfall > 0);
  return (
    <figure className="stack stack-sm" style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={tokens.status.errorBg} />
            <line x1="0" y1="0" x2="0" y2="6" stroke={C.shortfall} strokeWidth="2.5" />
          </pattern>
        </defs>
        <line x1={left} x2={W - 8} y1={yUp(maxUp)} y2={yUp(maxUp)} stroke={tokens.border.default} />
        <text x={left - 8} y={yUp(maxUp) + 4} textAnchor="end">{money(maxUp, { whole: true })}</text>
        <line x1={left} x2={W - 8} y1={zeroY} y2={zeroY} stroke={tokens.text.primary} />
        <text x={left - 8} y={zeroY + 4} textAnchor="end">$0</text>
        {downScale > 0 && <text x={left - 8} y={yDown(downScale) + 4} textAnchor="end">−{money(downScale, { whole: true })}</text>}
        {rows.map((r, i) => {
          const x = left + i * bw + bw * 0.15;
          const w = bw * 0.7;
          return (
            <g key={r.month}>
              {r.balance > 0 && <rect rx={3} x={x} y={yUp(r.balance)} width={w} height={zeroY - yUp(r.balance)} fill={C.savings} stroke={C.income} strokeWidth="1" />}
              {r.shortfall > 0 && <rect rx={3} x={x} y={zeroY} width={w} height={yDown(r.shortfall) - zeroY} fill="url(#hatch)" stroke={C.shortfall} strokeWidth="1" />}
              {(rows.length <= 12 || i % 2 === 0) && <text x={x + w / 2} y={H - 10} textAnchor="middle">M{r.month}</text>}
            </g>
          );
        })}
      </svg>
      <div className="legend" aria-hidden="true">
        <span><i style={{ background: C.savings, border: `1px solid ${C.income}` }} />Projected savings</span>
        {maxDown > 0 && <span><i style={{ background: 'repeating-linear-gradient(45deg,#9c2f27 0 2px,#f5dfdb 2px 5px)' }} />Shortfall (not covered by savings)</span>}
      </div>
      <figcaption className="small muted">
        {first
          ? `Savings run out in month ${first.month}. ${rows[rows.length - 1].shortfall ? `By month ${rows.length} the shortfall is ${money(rows[rows.length - 1].shortfall)}.` : `Income catches up; savings end at ${money(rows[rows.length - 1].balance)}.`}`
          : `Savings stay above $0 for all ${rows.length} months, ending at ${money(rows[rows.length - 1]?.balance ?? 0)}.`}
      </figcaption>
      <details className="how">
        <summary>Show month-by-month numbers</summary>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Month</th><th className="r">Income</th><th className="r">Expenses</th><th className="r">One-time</th><th className="r">Savings</th><th className="r">Shortfall</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month}>
                  <td>{r.month}</td><td className="r num">{money(r.income)}</td><td className="r num">{money(r.expenses)}</td><td className="r num">{money(r.oneTime)}</td><td className="r num">{money(r.balance)}</td><td className={`r num ${r.shortfall ? 'neg' : ''}`}>{r.shortfall ? money(r.shortfall) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Horizontal comparison bars (e.g. baseline vs scenario). */
export function CompareBars({ items, title }: { items: { label: string; value: number | null; note?: string }[]; title: string }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value ?? 0)));
  return (
    <div className="stack stack-sm" role="group" aria-label={title}>
      {items.map((i) => {
        const v = i.value ?? 0;
        return (
          <div key={i.label} className="stack" style={{ ['--gap' as string]: '4px' }}>
            <div className="row-between small">
              <span>{i.label}</span>
              <strong className={`num ${v < 0 ? 'neg' : ''}`}>{i.value === null ? 'Not calculable' : money(v)}</strong>
            </div>
            <div className="bar" aria-hidden="true" style={{ height: 10 }}>
              <span style={{ width: `${(Math.abs(v) / max) * 100}%`, background: v < 0 ? C.shortfall : C.income }} />
            </div>
            {i.note && <span className="xs muted">{i.note}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Small sparkline-style bars for the marketing preview. */
export function MiniBars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values.map(Math.abs), 1);
  return (
    <svg viewBox={`0 0 ${values.length * 14} 48`} className="chart" role="img" aria-label={label} style={{ height: 48 }}>
      <line x1="0" x2={values.length * 14} y1="24" y2="24" stroke={tokens.border.default} />
      {values.map((v, i) => {
        const h = (Math.abs(v) / max) * 22;
        return <rect key={i} x={i * 14 + 2} y={v >= 0 ? 24 - h : 24} width="10" height={Math.max(1, h)} fill={v >= 0 ? C.income : C.shortfall} />;
      })}
    </svg>
  );
}
