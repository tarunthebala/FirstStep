/**
 * Learn modules. Factual statements were checked against the linked official pages on 2026-10-24.
 * Rules change (the One Big Beautiful Bill Act changed federal repayment on July 1, 2026), so each module
 * points to the official source rather than restating details that may move.
 */
import { LEARN_MODULE_IDS } from './learn-ids';

export type ExerciseKind = 'interest' | 'capitalization' | 'budget' | 'takehome' | 'emergency' | 'compare_terms' | 'federal_private' | 'missed' | 'first_payment' | 'loan_parts';

export interface LearnModule {
  id: string;
  title: string;
  minutes: number;
  objective: string;
  explanation: string[];
  example: { title: string; body: string };
  exercise: { kind: ExerciseKind; prompt: string };
  quiz: { question: string; options: string[]; correct: number; explanation: string };
  references: { label: string; url: string }[];
}

const FSA = {
  repayment: { label: 'Federal Student Aid — Student Loan Repayment', url: 'https://studentaid.gov/manage-loans/repayment' },
  plans: { label: 'Federal Student Aid — Repayment Plans', url: 'https://studentaid.gov/manage-loans/repayment/plans' },
  bigUpdates: { label: 'Federal Student Aid — One Big Beautiful Bill Act Updates', url: 'https://studentaid.gov/bigupdates' },
  rates: { label: 'Federal Student Aid — Interest Rates and Fees', url: 'https://studentaid.gov/understand-aid/types/loans/interest-rates' },
  subUnsub: { label: 'Federal Student Aid — Direct Subsidized and Unsubsidized Loans', url: 'https://studentaid.gov/understand-aid/types/loans/subsidized-unsubsidized' },
  fedVsPrivate: { label: 'Federal Student Aid — Federal vs. Private Loans', url: 'https://studentaid.gov/understand-aid/types/loans/federal-vs-private' },
  default: { label: 'Federal Student Aid — Delinquency and Default', url: 'https://studentaid.gov/manage-loans/default' },
  servicers: { label: 'Federal Student Aid — Who’s My Loan Servicer?', url: 'https://studentaid.gov/manage-loans/repayment/servicers' },
  relief: { label: 'Federal Student Aid — Temporary Relief', url: 'https://studentaid.gov/manage-loans/lower-payments/get-temporary-relief' },
};
const CFPB = {
  studentLoans: { label: 'CFPB — Student Loans', url: 'https://www.consumerfinance.gov/consumer-tools/student-loans/' },
  keyTerms: { label: 'CFPB — Student Loan Key Terms', url: 'https://www.consumerfinance.gov/consumer-tools/student-loans/answers/key-terms/' },
  fedPrivate: { label: 'CFPB — Federal vs. private student loans', url: 'https://www.consumerfinance.gov/ask-cfpb/what-are-the-main-differences-between-federal-student-loans-and-private-student-loans-en-545/' },
  payingForCollege: { label: 'CFPB — Paying for College', url: 'https://www.consumerfinance.gov/paying-for-college/' },
  save: { label: 'CFPB — Start Small, Save Up', url: 'https://www.consumerfinance.gov/start-small-save-up/' },
};

export const LEARN_MODULES: LearnModule[] = [
  {
    id: 'understanding-student-loans',
    title: 'Understanding your student loans',
    minutes: 5,
    objective: 'Name the parts of a student loan and know where the official numbers live.',
    explanation: [
      'Every loan has a principal (what you borrowed and still owe), an interest rate (the yearly cost of borrowing), and a servicer (the company that bills you and answers questions).',
      'Federal student loans are recorded in your StudentAid.gov account. Private loans are not; you find those through your lender or a credit report.',
      'Your servicer has the official balance, due dates and repayment plan. FirstStep helps you organize and practice with those numbers, but your servicer’s records are the ones that count.',
    ],
    example: { title: 'Reading a loan line', body: 'A line that says “Direct Unsubsidized — $5,500 principal — 6.39% fixed — In grace” tells you the loan type, what you owe before interest, the rate that applies every year, and that payments haven’t started yet.' },
    exercise: { kind: 'loan_parts', prompt: 'Match each loan detail to what it tells you.' },
    quiz: {
      question: 'Who has the official due date for your federal student loan payment?',
      options: ['FirstStep', 'Your loan servicer', 'Your school’s bursar', 'Your bank'],
      correct: 1,
      explanation: 'Your servicer manages billing and has the official schedule. FirstStep can store a date you enter, but it can’t confirm it.',
    },
    references: [FSA.servicers, CFPB.keyTerms],
  },
  {
    id: 'federal-vs-private',
    title: 'Federal versus private student loans',
    minutes: 5,
    objective: 'Explain the practical differences between federal and private loans before repayment.',
    explanation: [
      'Federal loans come from the U.S. Department of Education. They have fixed rates set by law and access to federal repayment plans, including plans based on income, plus deferment and forbearance options.',
      'Private loans come from banks, credit unions and other lenders. Rates may be fixed or variable and often depend on credit. Repayment options are set by the lender and vary widely.',
      'Refinancing federal loans into a private loan can lower a rate, but you give up federal protections. That trade-off is worth understanding before you decide.',
    ],
    example: { title: 'Same balance, different options', body: 'Two $10,000 loans at similar rates can behave very differently if you lose your job: the federal loan has federal relief options; the private loan has whatever the lender offers.' },
    exercise: { kind: 'federal_private', prompt: 'Sort each feature into federal, private, or “depends on the lender”.' },
    quiz: {
      question: 'Which is generally true of federal student loans but not guaranteed for private loans?',
      options: ['Access to federal income-based repayment plans', 'A lower balance', 'No interest', 'Automatic forgiveness after graduation'],
      correct: 0,
      explanation: 'Federal loans can use federal repayment plans. Private loan options are set by each lender.',
    },
    references: [FSA.fedVsPrivate, CFPB.fedPrivate, FSA.repayment],
  },
  {
    id: 'understanding-interest',
    title: 'Understanding interest',
    minutes: 6,
    objective: 'Calculate how much interest a loan builds each day and over a month.',
    explanation: [
      'Federal Student Aid describes a simple daily interest formula: daily interest = principal × annual rate ÷ 365. Multiply by the number of days to see interest over a period.',
      'Subsidized loans don’t build interest during certain periods because the government pays it. Unsubsidized loans build interest from the day the money is paid out, including while you’re in school.',
      'Paying interest as it builds, even small amounts during school or grace, keeps your balance from growing.',
    ],
    example: { title: '$10,000 at 6%', body: '$10,000 × 0.06 ÷ 365 ≈ $1.64 a day, or about $49 over 30 days.' },
    exercise: { kind: 'interest', prompt: 'Change the balance, rate and days to see how interest adds up.' },
    quiz: {
      question: 'A $5,000 unsubsidized loan at 5% builds about how much interest in 30 days?',
      options: ['About $2', 'About $21', 'About $250', 'Nothing until repayment'],
      correct: 1,
      explanation: '$5,000 × 0.05 ÷ 365 ≈ $0.68 a day; × 30 ≈ $20.55. Unsubsidized loans build interest before repayment.',
    },
    references: [FSA.rates, FSA.subUnsub],
  },
  {
    id: 'interest-capitalization',
    title: 'Interest capitalization',
    minutes: 5,
    objective: 'Describe what capitalization does and why it raises the cost of a loan.',
    explanation: [
      'Capitalization is when unpaid interest is added to your principal. From then on, interest is charged on the bigger balance.',
      'Whether and when it happens depends on your loan type and the rules that apply to it. Those rules have changed in recent years, so ask your servicer how your loans are treated.',
      'You can limit the effect by paying interest before it would capitalize. FirstStep’s payment estimates add recorded unpaid interest to principal as a cautious assumption and label it.',
    ],
    example: { title: 'A small difference that lasts', body: 'If $600 of unpaid interest is added to a $10,000 loan at 6%, you’ll pay interest on $10,600 for the rest of the loan. On a 10-year schedule that’s roughly $6–7 more each month.' },
    exercise: { kind: 'capitalization', prompt: 'See how the monthly payment changes if unpaid interest is added to principal.' },
    quiz: {
      question: 'After capitalization, interest is charged on…',
      options: ['Only the original principal', 'The principal plus the interest that was added', 'Nothing for six months', 'Only the interest'],
      correct: 1,
      explanation: 'Capitalized interest becomes part of principal, so future interest is calculated on the larger amount.',
    },
    references: [FSA.rates, CFPB.keyTerms],
  },
  {
    id: 'post-grad-budget',
    title: 'Building a post-graduation budget',
    minutes: 7,
    objective: 'Build a monthly budget from take-home pay and see how a loan payment fits.',
    explanation: [
      'Start with monthly take-home pay, not salary. List fixed costs (rent, insurance, phone), then variable costs (groceries, dining, shopping), then savings and debt payments.',
      'Cash flow is what’s left: income minus expenses. If it’s negative, the plan needs changes before it can work month after month.',
      'One month of spending isn’t always typical. Look at a few months and note one-time costs separately.',
    ],
    example: { title: 'A first-year budget', body: 'Take-home $3,200. Rent $1,100, utilities $120, groceries $320, transportation $250, phone $70, insurance $150, other $300. Expenses $2,310 leave $890 for a loan payment, savings and surprises.' },
    exercise: { kind: 'budget', prompt: 'Adjust the categories and watch your cash flow change.' },
    quiz: {
      question: 'Which number should a monthly budget start with?',
      options: ['Annual salary', 'Take-home pay per month', 'Your loan balance', 'Your credit limit'],
      correct: 1,
      explanation: 'Take-home pay is the money you actually have to spend after deductions.',
    },
    references: [CFPB.payingForCollege, FSA.repayment],
  },
  {
    id: 'take-home-pay',
    title: 'Understanding take-home pay',
    minutes: 5,
    objective: 'Estimate take-home pay from a salary offer and explain what gets deducted.',
    explanation: [
      'Your paycheck is smaller than salary ÷ 12. Common deductions include federal income tax, state and local income tax (where applicable), Social Security and Medicare, health insurance premiums and retirement contributions.',
      'Social Security (6.2%) and Medicare (1.45%) together take 7.65% of most wages. Income tax depends on your income, filing status and where you live.',
      'Your first pay stub is the best source. Until then, an estimate with a stated deduction rate is a reasonable starting point; update it when you have the real number.',
    ],
    example: { title: '$52,000 offer', body: '$52,000 ÷ 12 = $4,333 gross a month. If about 24% goes to taxes and benefits, take-home is roughly $3,290.' },
    exercise: { kind: 'takehome', prompt: 'Enter a salary and an estimated deduction rate.' },
    quiz: {
      question: 'Why budget with take-home pay instead of salary?',
      options: ['Salary includes money that never reaches your account', 'Take-home pay is always higher', 'Loan servicers require it', 'It doesn’t matter'],
      correct: 0,
      explanation: 'Taxes and benefit deductions come out first, so only take-home pay is available to spend.',
    },
    references: [CFPB.payingForCollege],
  },
  {
    id: 'emergency-fund',
    title: 'Creating an emergency fund',
    minutes: 5,
    objective: 'Set an emergency savings target from your own expenses.',
    explanation: [
      'An emergency fund is money you can reach quickly for a car repair, a medical bill or a gap between jobs.',
      'A common way to size it is a number of months of essential expenses. Starting small and saving regularly matters more than hitting a big number right away.',
      'Keep it somewhere accessible. Not every balance counts: money already set aside for rent next week isn’t an emergency fund.',
    ],
    example: { title: 'Starting point', body: 'Essentials of $2,000 a month × 3 months = a $6,000 target. Saving $150 a month gets there in about 40 months; $250 a month in 24.' },
    exercise: { kind: 'emergency', prompt: 'Pick your monthly essentials, months to cover and monthly savings.' },
    quiz: {
      question: 'Which balance belongs in an emergency fund?',
      options: ['Money set aside for next week’s rent', 'Savings you can reach quickly that isn’t already committed', 'Your credit card limit', 'Your 401(k) balance'],
      correct: 1,
      explanation: 'Emergency money should be accessible and uncommitted. Credit is debt, and retirement accounts may have penalties.',
    },
    references: [CFPB.save],
  },
  {
    id: 'understanding-repayment-plans',
    title: 'Understanding repayment plans',
    minutes: 7,
    objective: 'Describe how fixed and income-based plans differ and where to check which apply to you.',
    explanation: [
      'Federal repayment changed on July 1, 2026. For loans disbursed on or after that date, Federal Student Aid lists the Tiered Standard Plan (fixed payments over 10–25 years depending on the amount borrowed) and the Repayment Assistance Plan (RAP), which bases payments on income.',
      'Federal Student Aid says that if you don’t choose a plan for a loan disbursed on or after July 1, 2026, your servicer will place you on the Tiered Standard Plan. Older loans may have other options, and some borrowers in plans being phased out have until July 1, 2028 to choose.',
      'A longer term lowers the monthly payment but usually raises total interest. Use FirstStep to compare illustrative terms, then use the official Repayment Calculator on StudentAid.gov for your actual options.',
    ],
    example: { title: 'Term trade-off', body: '$25,000 at 6%: about $278/month over 10 years (≈$8,300 interest) vs. about $179/month over 20 years (≈$18,000 interest).' },
    exercise: { kind: 'compare_terms', prompt: 'Compare monthly payment and total interest across terms.' },
    quiz: {
      question: 'Extending a fixed repayment term from 10 to 20 years usually…',
      options: ['Raises the monthly payment and lowers total interest', 'Lowers the monthly payment and raises total interest', 'Changes nothing', 'Cancels interest'],
      correct: 1,
      explanation: 'Spreading payments out lowers each one, but interest builds for longer.',
    },
    references: [FSA.plans, FSA.bigUpdates, FSA.repayment],
  },
  {
    id: 'missed-payments',
    title: 'What happens if you miss a payment?',
    minutes: 5,
    objective: 'Explain delinquency, credit reporting and what to do early if a payment is hard to make.',
    explanation: [
      'Federal Student Aid says a loan becomes delinquent the first day after a missed payment and stays delinquent until the past-due amount is paid or other arrangements are made.',
      'If a federal loan is delinquent for 90 days or more, the servicer reports it to the national credit bureaus. Continued delinquency risks default, which has serious consequences.',
      'If a payment looks hard to make, contact your servicer before it’s due. Changing plans, deferment or forbearance may be available depending on your situation.',
    ],
    example: { title: 'Acting early', body: 'Someone who calls their servicer in week one of a job gap has more options and less damage than someone who waits three months.' },
    exercise: { kind: 'missed', prompt: 'Move the slider to see what has happened by each point after a missed payment.' },
    quiz: {
      question: 'When does a federal student loan become delinquent?',
      options: ['After 90 days', 'The first day after a missed payment', 'After a year', 'Only after default'],
      correct: 1,
      explanation: 'Delinquency starts the day after a missed payment. Credit reporting starts at 90 days.',
    },
    references: [FSA.default, FSA.relief],
  },
  {
    id: 'preparing-first-payment',
    title: 'Preparing for your first student loan payment',
    minutes: 6,
    objective: 'Build a checklist for the months before your first payment is due.',
    explanation: [
      'Federal Student Aid says Direct Subsidized, Direct Unsubsidized and FFEL loans have a six-month grace period after you graduate, leave school or drop below half-time; Perkins Loans have nine months; PLUS loans work differently.',
      'Find your servicer, create or check your online account, confirm your first due date, and choose a repayment plan before payments start.',
      'Practicing your payment for a few months before it’s due shows whether the budget works and builds a habit.',
    ],
    example: { title: 'Practice run', body: 'If your estimated payment is $240, move $240 into savings each month during grace. If it’s comfortable, you’re ready; the savings become a buffer.' },
    exercise: { kind: 'first_payment', prompt: 'Check off what you’ve done.' },
    quiz: {
      question: 'Per Federal Student Aid, how long is the grace period on a Direct Unsubsidized Loan?',
      options: ['None', 'Six months', 'Nine months', 'Two years'],
      correct: 1,
      explanation: 'Direct Subsidized, Direct Unsubsidized and FFEL loans have six months. Your servicer confirms the exact date for your loans.',
    },
    references: [FSA.repayment, FSA.servicers],
  },
];

if (LEARN_MODULES.map((m) => m.id).join() !== LEARN_MODULE_IDS.join()) throw new Error('Learn module ids out of sync');
