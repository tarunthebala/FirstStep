/** Plain-English definitions used by the learning coach (without AI) and tooltips. */
export const GLOSSARY: { term: string; aliases: string[]; definition: string; learn?: string }[] = [
  { term: 'Principal', aliases: ['principal'], definition: 'The amount you borrowed that you still owe, not counting interest.', learn: 'understanding-student-loans' },
  { term: 'Interest', aliases: ['interest', 'apr'], definition: 'The cost of borrowing, charged as a percentage of your principal. Federal Direct Loans use simple daily interest: principal × rate ÷ 365 each day.', learn: 'understanding-interest' },
  { term: 'Capitalization', aliases: ['capitaliz', 'capitalis'], definition: 'When unpaid interest is added to your principal. After that, interest is charged on the larger amount, so the loan grows faster. When it happens depends on the loan and its rules.', learn: 'interest-capitalization' },
  { term: 'Grace period', aliases: ['grace'], definition: 'A period after you leave school or drop below half-time before payments are due. Length and rules differ by loan type, so confirm yours with your servicer.', learn: 'preparing-first-payment' },
  { term: 'Servicer', aliases: ['servicer'], definition: 'The company that handles billing and questions for your loan. Your servicer has your official balance, plan and due dates.', learn: 'understanding-student-loans' },
  { term: 'Subsidized loan', aliases: ['subsidized'], definition: 'A federal loan where the government pays the interest during certain periods, such as while you are in school at least half-time.', learn: 'federal-vs-private' },
  { term: 'Unsubsidized loan', aliases: ['unsubsidized'], definition: 'A federal loan where interest builds up from the day the money is paid out, including while you are in school.', learn: 'federal-vs-private' },
  { term: 'Amortization', aliases: ['amortiz', 'amortis'], definition: 'Paying a loan off with equal monthly payments. Early payments are mostly interest; later ones are mostly principal.', learn: 'understanding-repayment-plans' },
  { term: 'Take-home pay', aliases: ['take-home', 'take home', 'net pay'], definition: 'What lands in your bank account after taxes, retirement contributions and benefits are taken out. Budget with this number, not your salary.', learn: 'take-home-pay' },
  { term: 'Cash flow', aliases: ['cash flow', 'cashflow'], definition: 'Money in minus money out over a month. Positive means room to save; negative means you would need savings or changes to cover the gap.', learn: 'post-grad-budget' },
  { term: 'Emergency fund', aliases: ['emergency'], definition: 'Savings you can reach quickly for unexpected costs or a gap in income.', learn: 'emergency-fund' },
  { term: 'Delinquency', aliases: ['delinquen', 'late payment', 'missed payment', 'miss a payment'], definition: 'A loan is delinquent the day after a payment is missed. Long delinquency can lead to default, which has serious consequences.', learn: 'missed-payments' },
  { term: 'Default', aliases: ['default'], definition: 'Failing to repay as agreed for an extended period. For federal loans it can lead to collections and damaged credit. Contact your servicer early if you are struggling.', learn: 'missed-payments' },
  { term: 'Repayment Assistance Plan (RAP)', aliases: ['rap', 'repayment assistance'], definition: 'An income-based federal plan available from July 1, 2026. Payments are a percentage of income. Check StudentAid.gov for whether it applies to your loans.', learn: 'understanding-repayment-plans' },
];

export const SERVICER_QUESTIONS = [
  'What is the official date my first payment is due?',
  'When does my grace period end for each of my loans?',
  'What is my current principal and unpaid interest for each loan?',
  'Will any unpaid interest be capitalized when repayment starts?',
  'Which repayment plans are available for my loans, and what would my payment be on each?',
  'Do you offer an interest rate reduction for autopay?',
  'How do I update my contact information so I don’t miss notices?',
];
