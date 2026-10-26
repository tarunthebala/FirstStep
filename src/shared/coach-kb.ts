/**
 * The learning coach's built-in library: hand-written answers to common financial literacy questions for
 * students and new graduates. No AI, no network — every answer here was written in advance.
 *
 * Matching: each topic lists keyword phrases. A question scores a topic by the longest phrase it contains
 * (longer, more specific phrases win; more matches break ties), so "credit card for emergencies" beats "credit card".
 * Keywords are matched at the start of a word, so "capitaliz" also matches "capitalized" and "capitalization".
 * Apostrophes are removed before matching, so write "cant", not "can't".
 *
 * Policy note: federal student loan rules changed for loans made on or after July 1, 2026. Answers point to
 * StudentAid.gov or the servicer for specifics instead of stating details that can change.
 */

export type TopicCategory =
  | 'Student loan basics'
  | 'Interest'
  | 'Repayment'
  | 'If paying gets hard'
  | 'Budgeting and income'
  | 'Saving'
  | 'Credit and debt'
  | 'Banking and safety'
  | 'Using FirstStep';

export interface CoachTopic {
  id: string;
  category: TopicCategory;
  /** A natural question; shown as a clickable chip, and must match this topic when asked. */
  q: string;
  keywords: string[];
  answer: string;
  related: string[];
  /** Added to the match score; used so safety topics (scams) win over the topic the scam is about. */
  priority?: number;
}

export const TOPIC_CATEGORIES: TopicCategory[] = [
  'Student loan basics',
  'Interest',
  'Repayment',
  'If paying gets hard',
  'Budgeting and income',
  'Saving',
  'Credit and debt',
  'Banking and safety',
  'Using FirstStep',
];

export const TOPICS: CoachTopic[] = [
  // ───────── Student loan basics
  {
    id: 'how-loans-work',
    category: 'Student loan basics',
    q: 'How do student loans work?',
    keywords: ['what is a loan', 'what is a student loan', 'how do loans work', 'how do student loans work', 'student loans work', 'loan basics', 'loan work'],
    answer: 'A loan is money you borrow now and repay later, plus interest. With student loans:\n• The school receives the money (disbursement) for tuition and costs, and any leftover goes to you.\n• Interest starts building right away on most loans, except subsidized ones while you’re in school.\n• After you leave school and any grace period ends, you make monthly payments to your servicer until it’s paid off.\n\nThe amount you borrow, the rate and the repayment term together decide your monthly payment.',
    related: ['federal-vs-private', 'interest', 'grace-period'],
  },
  {
    id: 'principal',
    category: 'Student loan basics',
    q: 'What is principal?',
    keywords: ['principal'],
    answer: 'Principal is the amount you borrowed that you still owe, not counting interest.\n\nInterest is calculated on your principal, so lowering principal lowers the interest that builds each day. When unpaid interest is capitalized, it becomes part of your principal.',
    related: ['interest', 'capitalization', 'extra-payments'],
  },
  {
    id: 'federal-vs-private',
    category: 'Student loan basics',
    q: 'What is the difference between federal and private loans?',
    keywords: ['federal vs private', 'federal and private', 'private loan', 'private student loan', 'federal loan', 'federal or private', 'kind of loan', 'type of loan', 'types of loans'],
    answer: 'Federal loans come from the U.S. Department of Education. They have fixed interest rates set by law and protections like income-driven repayment, deferment and forgiveness programs.\n\nPrivate loans come from banks, credit unions or online lenders. Rates can be fixed or variable and often depend on your credit, and protections vary by lender.\n\nTo see which federal loans you have, check StudentAid.gov. Private loans won’t appear there, so look at your lender’s statements or your credit report.',
    related: ['subsidized', 'refinancing', 'find-my-loans'],
  },
  {
    id: 'subsidized',
    category: 'Student loan basics',
    q: 'What is the difference between subsidized and unsubsidized loans?',
    keywords: ['subsidized', 'unsubsidized', 'subsidised'],
    answer: 'Both are federal Direct Loans.\n\n• Subsidized: the government pays the interest while you’re in school at least half-time, during the grace period, and during deferment. They’re based on financial need.\n• Unsubsidized: interest starts building the day the money is paid out, including while you’re in school.\n\nIf you can, paying the interest on unsubsidized loans while in school keeps it from being capitalized later.',
    related: ['capitalization', 'grace-period', 'interest'],
  },
  {
    id: 'plus-loans',
    category: 'Student loan basics',
    q: 'What are Parent PLUS and Grad PLUS loans?',
    keywords: ['plus loan', 'parent plus', 'grad plus', 'graduate plus'],
    answer: 'PLUS loans are federal loans for parents of undergraduates (Parent PLUS) and, historically, for graduate students (Grad PLUS). They require a credit check for adverse history and usually have higher rates and fees than Direct Subsidized or Unsubsidized loans.\n\nBorrowing limits and availability changed for new loans starting July 1, 2026, so check StudentAid.gov for what applies to you. A Parent PLUS loan is the parent’s legal debt, not the student’s.',
    related: ['federal-vs-private', 'repayment-plans'],
  },
  {
    id: 'servicer',
    category: 'Student loan basics',
    q: 'What is a loan servicer?',
    keywords: ['what is a loan servicer', 'loan servicer', 'servicer', 'who do i pay', 'who to pay', 'where do i pay', 'who services'],
    answer: 'Your servicer is the company that handles billing and questions for your loan. It sends your bills, processes payments, and switches your repayment plan.\n\nYour servicer has your official balance, plan and due dates. For federal loans, your servicer is listed in your StudentAid.gov dashboard, and contacting them is always free.',
    related: ['servicer-questions', 'find-my-loans', 'scams'],
  },
  {
    id: 'servicer-questions',
    category: 'Student loan basics',
    q: 'What questions should I ask my servicer?',
    keywords: ['ask my servicer', 'ask the servicer', 'ask your servicer', 'questions to ask', 'questions should i ask', 'call my servicer'],
    answer: 'Good questions to ask your loan servicer:\n• What is the official date my first payment is due?\n• When does my grace period end for each loan?\n• What is my current principal and unpaid interest for each loan?\n• Will any unpaid interest be capitalized when repayment starts?\n• Which repayment plans are available, and what would my payment be on each?\n• Do you offer an interest rate reduction for autopay?\n• How do I update my contact information so I don’t miss notices?',
    related: ['servicer', 'first-payment', 'autopay'],
  },
  {
    id: 'find-my-loans',
    category: 'Student loan basics',
    q: 'How do I find out what loans I have?',
    keywords: ['find my loans', 'what loans do i have', 'what loans i have', 'see my loans', 'look up my loans', 'mystudentdata', 'studentaid gov', 'studentaid'],
    answer: 'For federal loans, log in to StudentAid.gov with your FSA ID. Your dashboard lists each loan, its balance, rate and servicer. You can also download “My Aid Data” (MyStudentData.txt) and import it into FirstStep.\n\nPrivate loans aren’t on StudentAid.gov. Check your lender’s website, your school’s financial aid office, or your credit report at AnnualCreditReport.com, where all your loans appear.',
    related: ['fsa-id', 'federal-vs-private', 'credit-report'],
  },
  {
    id: 'fsa-id',
    category: 'Student loan basics',
    q: 'What is an FSA ID?',
    keywords: ['fsa id', 'fsaid', 'studentaid login', 'studentaid account'],
    answer: 'Your FSA ID is the username and password for StudentAid.gov. You use it to see your federal loans, sign the FAFSA, and manage repayment.\n\nTreat it like a bank password: never share it with anyone, including companies that offer to “help” with your loans. Sharing it lets them change your plan or contact details.',
    related: ['find-my-loans', 'scams'],
  },
  {
    id: 'fafsa',
    category: 'Student loan basics',
    q: 'What is the FAFSA?',
    keywords: ['pay for college', 'pay for school', 'tuition', 'fafsa', 'financial aid form', 'apply for aid', 'apply for financial aid'],
    answer: 'The FAFSA (Free Application for Federal Student Aid) is the form that determines whether you can get federal grants, work-study and federal loans. Many states and schools use it for their aid too.\n\nYou fill it out each year you’re in school, and it’s free at StudentAid.gov. Any site that charges you to file it isn’t the official one.',
    related: ['grants-scholarships', 'subsidized'],
  },
  {
    id: 'grants-scholarships',
    category: 'Student loan basics',
    q: 'Do grants and scholarships have to be paid back?',
    keywords: ['grant', 'scholarship', 'pell', 'work study', 'free money', 'pay back a grant'],
    answer: 'Usually not. Grants (like the Federal Pell Grant) and scholarships are gift aid that you don’t repay, as long as you meet their conditions. Some grants must be repaid if you withdraw early or don’t meet service requirements.\n\nWork-study is money you earn from a job, so it isn’t repaid either. Loans are the only aid you always have to repay, with interest. Using gift aid first keeps your borrowing lower.',
    related: ['fafsa', 'federal-vs-private'],
  },
  {
    id: 'grace-period',
    category: 'Student loan basics',
    q: 'What is a grace period?',
    keywords: ['grace period', 'grace'],
    answer: 'A grace period is time after you graduate, leave school or drop below half-time before your first payment is due. For federal Direct Subsidized and Unsubsidized loans it’s usually six months. Other loans have different rules, and private lenders vary.\n\nInterest on unsubsidized loans keeps building during the grace period. It’s a good time to set up your servicer account, choose a plan and practice your payment.',
    related: ['first-payment', 'capitalization', 'practice-payment'],
  },
  {
    id: 'first-payment',
    category: 'Student loan basics',
    q: 'When is my first payment due?',
    keywords: ['after graduation', 'after i graduate', 'when i graduate', 'first payment', 'when do i start paying', 'when do payments start', 'when does repayment start', 'start repayment', 'due date'],
    answer: 'Your servicer sets the official date. For most federal Direct Loans, repayment begins after the grace period, which is usually six months after you leave school or drop below half-time.\n\nYour servicer should contact you before the first bill. Confirm the exact date with them and record it in FirstStep under My Finances. Until it’s confirmed, FirstStep labels any date as an estimate.',
    related: ['grace-period', 'servicer-questions', 'autopay'],
  },

  // ───────── Interest
  {
    id: 'interest',
    category: 'Interest',
    q: 'How does student loan interest work?',
    keywords: ['interest work', 'how is interest', 'interest calculated', 'daily interest', 'simple interest', 'interest rate', 'interest'],
    answer: 'Interest is the cost of borrowing, charged as a percentage of your principal. Federal Direct Loans use simple daily interest:\n\nprincipal × annual rate ÷ 365 = interest per day\n\nExample: $10,000 at 6% builds about $1.64 a day, or about $50 a month. Each payment covers the interest that’s built up first, and the rest reduces principal.',
    related: ['capitalization', 'fixed-vs-variable', 'apr'],
  },
  {
    id: 'capitalization',
    category: 'Interest',
    q: 'What is interest capitalization?',
    keywords: ['capitaliz', 'capitalis', 'interest added to', 'interest gets added', 'interest on interest'],
    answer: 'Capitalization is when unpaid interest is added to your principal. After that, interest is charged on the larger amount, so the loan grows faster.\n\nExample: $1,000 of unpaid interest capitalized onto a $20,000 loan means you now pay interest on $21,000.\n\nWhen it happens depends on the loan type and rules, so ask your servicer. Paying interest as it builds, even during school or grace, keeps it from capitalizing.',
    related: ['interest', 'subsidized', 'deferment-forbearance'],
  },
  {
    id: 'fixed-vs-variable',
    category: 'Interest',
    q: 'What is the difference between fixed and variable rates?',
    keywords: ['fixed rate', 'variable rate', 'fixed or variable', 'fixed vs variable', 'fixed and variable', 'rate change'],
    answer: 'A fixed rate stays the same for the life of the loan, so your payment is predictable. All federal student loans made today have fixed rates.\n\nA variable rate can rise or fall with a market index. It may start lower, but your payment can go up later. Some private loans are variable. If you have one, check how high the rate is allowed to go.',
    related: ['interest', 'federal-vs-private', 'refinancing'],
  },
  {
    id: 'apr',
    category: 'Interest',
    q: 'What is APR?',
    keywords: ['apr', 'annual percentage rate', 'annual percentage'],
    answer: 'APR (annual percentage rate) is the yearly cost of borrowing, including the interest rate and some fees. It lets you compare loans or credit cards on equal terms.\n\nFor credit cards, APR is what you’re charged on balances you don’t pay off. Card APRs are often 20% or more, which is why carrying a balance gets expensive quickly.',
    related: ['interest', 'credit-card', 'credit-card-interest'],
  },
  {
    id: 'compound-interest',
    category: 'Interest',
    q: 'What is compound interest?',
    keywords: ['compound interest', 'compound', 'compounding', 'rule of 72'],
    answer: 'Compound interest is interest earned (or charged) on earlier interest, not just on the original amount. Over time it snowballs.\n\nWhen you save or invest, compounding works for you. When you owe on a credit card, it works against you.\n\nThe rule of 72 is a quick estimate: 72 ÷ the annual rate is roughly how many years it takes money to double. At 6%, that’s about 12 years.',
    related: ['interest', 'start-saving', 'retirement'],
  },
  {
    id: 'total-interest',
    category: 'Interest',
    q: 'How do longer terms change total interest?',
    keywords: ['longer term', 'shorter term', 'loan term', 'total interest', 'extend', 'longer repayment', 'more years', '10 year', '20 year', '25 year'],
    answer: 'A longer term lowers your monthly payment but raises the total interest you pay, because the balance stays around longer.\n\nExample: $25,000 at 6%\n• 10 years: about $278 a month, about $8,300 in interest\n• 20 years: about $179 a month, about $18,000 in interest\n\nThe Repayment Comparison scenario in Money Lab lets you test this with your own loans.',
    related: ['repayment-plans', 'extra-payments', 'amortization'],
  },
  {
    id: 'amortization',
    category: 'Interest',
    q: 'What is amortization?',
    keywords: ['amortiz', 'amortis', 'payment schedule', 'where does my payment go'],
    answer: 'Amortization means paying off a loan with equal monthly payments over a set term. Each payment first covers the interest that built up that month, and the rest reduces principal.\n\nEarly payments are mostly interest. As principal shrinks, less interest builds, so later payments go mostly to principal. Extra payments speed this up.',
    related: ['total-interest', 'extra-payments', 'principal'],
  },

  // ───────── Repayment
  {
    id: 'repayment-plans',
    category: 'Repayment',
    q: 'What repayment plans are there?',
    keywords: ['lower my monthly payment', 'lower my payment', 'reduce my payment', 'how long', 'how many years', 'pay back', 'repayment plan', 'payment plan', 'which plan', 'choose a plan', 'standard plan', 'tiered standard', 'income driven', 'income based', 'idr', 'ibr', 'paye', 'save plan'],
    answer: 'Federal repayment plans changed for loans made on or after July 1, 2026. Broadly, there are two kinds:\n\n• Fixed-payment plans (like the standard plans): the same payment each month over a set term.\n• Income-based plans (like the Repayment Assistance Plan): payments based on your income and family size.\n\nWhich plans you can use depends on when your loans were made. Use the Loan Simulator on StudentAid.gov or ask your servicer. Private loans have their own terms.',
    related: ['rap', 'total-interest', 'servicer-questions'],
  },
  {
    id: 'rap',
    category: 'Repayment',
    q: 'What is the Repayment Assistance Plan?',
    keywords: ['repayment assistance', 'rap'],
    answer: 'The Repayment Assistance Plan (RAP) is an income-based federal plan available starting July 1, 2026. Your payment is a percentage of your income, with adjustments for dependents.\n\nIncome-based payments can be lower when you’re starting out, but a lower payment can mean paying for more years. StudentAid.gov has the current rules and a simulator to see whether RAP applies to your loans and what you’d pay.',
    related: ['repayment-plans', 'forgiveness'],
  },
  {
    id: 'forgiveness',
    category: 'Repayment',
    q: 'How does loan forgiveness work?',
    keywords: ['forgive', 'forgiveness', 'pslf', 'public service', 'discharge', 'cancel'],
    answer: 'Some federal programs forgive the remaining balance if you meet their rules:\n• Public Service Loan Forgiveness (PSLF): after 120 qualifying payments while working full-time for a government or qualifying nonprofit employer.\n• Income-based plans: forgiveness of any balance left after a long period of payments.\n• Discharge in specific cases, like total and permanent disability.\n\nRules and eligibility are strict and change over time, so check StudentAid.gov. Private loans generally don’t offer forgiveness.',
    related: ['rap', 'repayment-plans', 'scams'],
  },
  {
    id: 'extra-payments',
    category: 'Repayment',
    q: 'Should I make extra payments on my loans?',
    keywords: ['pay off my loans', 'pay off loans', 'faster', 'extra payment', 'pay extra', 'pay more', 'pay off early', 'paying off early', 'pay it off faster', 'pay off faster', 'prepay', 'prepayment', 'additional payment'],
    answer: 'Extra payments reduce principal sooner, so less interest builds and you finish earlier. Student loans have no prepayment penalty.\n\nTips:\n• Ask your servicer to apply the extra to principal, ideally on your highest-rate loan, instead of pushing your next due date back.\n• Build a starter emergency fund first, so a surprise expense doesn’t go on a credit card.\n• If your employer matches retirement contributions, getting the full match usually comes first.',
    related: ['save-vs-pay', 'avalanche-snowball', 'emergency-fund'],
  },
  {
    id: 'save-vs-pay',
    category: 'Repayment',
    q: 'Is it better to save the extra or pay down loans?',
    keywords: ['save or pay', 'save the extra', 'save vs pay', 'saving or paying', 'pay down loans or save', 'save instead', 'pay down loan', 'pay off loans or save', 'invest or pay'],
    answer: 'It’s a trade-off, and many people do some of both:\n\n• Savings first, if you don’t have an emergency fund. Without one, a surprise expense can go on a high-interest credit card.\n• Employer retirement match next, since it’s an instant return.\n• Then compare: extra payments “earn” your loan’s interest rate, guaranteed. Higher-rate debt (above roughly 6–7%) is a stronger case for paying down.\n\nThe Lifestyle Changes scenario in Money Lab shows what an extra amount each month could do.',
    related: ['emergency-fund', 'extra-payments', 'retirement'],
  },
  {
    id: 'avalanche-snowball',
    category: 'Repayment',
    q: 'What are the avalanche and snowball methods?',
    keywords: ['avalanche', 'snowball', 'which loan first', 'which debt first', 'pay first', 'multiple loans'],
    answer: 'Both are ways to target extra payments when you have several debts. Make the minimum on everything, then:\n\n• Avalanche: put extra toward the highest interest rate first. This saves the most money.\n• Snowball: put extra toward the smallest balance first. Paying one off quickly can keep you motivated.\n\nEither beats paying only minimums. Pick the one you’ll actually stick with.',
    related: ['extra-payments', 'credit-card-interest'],
  },
  {
    id: 'autopay',
    category: 'Repayment',
    q: 'Should I set up autopay?',
    keywords: ['autopay', 'auto pay', 'automatic payment', 'auto debit', 'autodebit'],
    answer: 'Autopay takes your loan payment from your bank account automatically on the due date, so you don’t miss one by accident. Many federal servicers also lower your interest rate by 0.25% while you’re enrolled, so ask yours.\n\nKeep enough in checking to cover it. A failed payment can bring bank fees. Time your due date close to payday if your servicer allows it.',
    related: ['overdraft', 'servicer-questions', 'first-payment'],
  },
  {
    id: 'consolidation',
    category: 'Repayment',
    q: 'What is loan consolidation?',
    keywords: ['consolidat', 'combine my loans', 'combine loans', 'one payment'],
    answer: 'A federal Direct Consolidation Loan combines several federal loans into one, with one payment and one servicer. The new rate is the weighted average of your old rates, rounded up slightly, so it doesn’t lower your interest.\n\nIt can make you eligible for certain plans, but it can also capitalize unpaid interest and affect progress toward forgiveness. Read StudentAid.gov’s guidance before applying. It’s free; never pay a company to do it.',
    related: ['refinancing', 'capitalization', 'scams'],
  },
  {
    id: 'refinancing',
    category: 'Repayment',
    q: 'What is refinancing a student loan?',
    keywords: ['refinanc', 'refi'],
    answer: 'Refinancing means a private lender pays off your loans and gives you a new private loan, ideally at a lower rate. Your credit and income affect the rate you’re offered.\n\nThe big trade-off: refinancing federal loans turns them into private loans, so you permanently lose federal protections like income-based plans, deferment and forgiveness programs. Compare carefully, and never refinance federal loans just for a small rate drop without weighing that.',
    related: ['consolidation', 'federal-vs-private', 'fixed-vs-variable'],
  },
  {
    id: 'interest-deduction',
    category: 'Repayment',
    q: 'Is student loan interest tax deductible?',
    keywords: ['tax deductible', 'interest deduction', 'deduct', 'tax break', 'interest on my taxes', '1098', 'taxes on student loan'],
    answer: 'Often, yes. The student loan interest deduction lets eligible borrowers deduct up to $2,500 of interest paid each year, even without itemizing. It phases out at higher incomes.\n\nYour servicer sends a Form 1098-E showing the interest you paid. Tax rules can change, so check IRS.gov or a tax preparer for your situation.',
    related: ['taxes-paycheck', 'interest'],
  },

  // ───────── If paying gets hard
  {
    id: 'cant-pay',
    category: 'If paying gets hard',
    q: 'What can I do if I can’t make my payment?',
    keywords: ['cant make my payment', 'cant make a payment', 'cant pay', 'cant afford', 'can not pay', 'cannot pay', 'unable to pay', 'struggling', 'job search', 'lost my job', 'no job', 'unemployed', 'cant make'],
    answer: 'Contact your servicer before you miss a payment. You usually have options:\n\n• Switch to an income-based plan, where the payment can be much lower, sometimes very small, if your income is low.\n• Ask about deferment or forbearance to pause payments for a while (interest may still build).\n• Change your due date to line up with your paycheck.\n\nAsking is free. Acting early protects your credit and keeps you from going into default.',
    related: ['deferment-forbearance', 'delinquency', 'rap'],
  },
  {
    id: 'deferment-forbearance',
    category: 'If paying gets hard',
    q: 'What is the difference between deferment and forbearance?',
    keywords: ['deferment', 'defer', 'forbearance', 'pause payments', 'pause my payments', 'postpone'],
    answer: 'Both let you temporarily pause or reduce payments:\n\n• Deferment: for specific situations, like going back to school at least half-time. On subsidized loans, the government may pay the interest.\n• Forbearance: often for financial hardship. Interest keeps building on all loans and may be capitalized afterward.\n\nThe available types and time limits changed under recent federal law, so ask your servicer. If your income is low, an income-based plan can be a better long-term fix.',
    related: ['cant-pay', 'capitalization', 'rap'],
  },
  {
    id: 'delinquency',
    category: 'If paying gets hard',
    q: 'What happens if I miss a student loan payment?',
    keywords: ['miss a student loan payment', 'miss a loan payment', 'miss my payment', 'miss a payment', 'missed a payment', 'missed payment', 'late payment', 'pay late', 'delinquen', 'behind on'],
    answer: 'Your loan becomes delinquent the day after a missed payment. You may owe a late fee. For federal loans, servicers report delinquency to the credit bureaus after 90 days, which can lower your credit score.\n\nIf you miss one, pay as soon as you can and call your servicer. They can help you catch up or change your plan. The longer it goes, the closer you get to default.',
    related: ['default', 'cant-pay', 'credit-score'],
  },
  {
    id: 'default',
    category: 'If paying gets hard',
    q: 'What does default mean?',
    keywords: ['default', 'collections', 'garnish', 'wage garnishment', 'tax refund taken'],
    answer: 'Default means you’ve failed to repay as agreed for an extended time. For most federal loans, that’s about 270 days of missed payments.\n\nConsequences can be serious: the full balance can become due, your credit is damaged, collection fees are added, and the government can take tax refunds or garnish wages.\n\nThere are ways back, like loan rehabilitation, but avoiding default is much easier. Contact your servicer early.',
    related: ['delinquency', 'cant-pay', 'credit-score'],
  },

  // ───────── Budgeting and income
  {
    id: 'budget',
    category: 'Budgeting and income',
    q: 'How do I make a budget?',
    keywords: ['make a budget', 'start a budget', 'create a budget', 'build a budget', 'how to budget', 'budgeting', 'budget'],
    answer: 'A simple way to start:\n1. Use your take-home pay, not your salary.\n2. List fixed costs: rent, utilities, phone, insurance, loan payments.\n3. Estimate flexible costs from a month of real spending: groceries, gas, eating out.\n4. Give the leftover a job: savings, extra payments, or fun money.\n5. Check in weekly and adjust.\n\nFirstStep’s My Finances page does this with your own numbers, and the 50/30/20 rule gives a starting split.',
    related: ['50-30-20', 'take-home-pay', 'cash-flow'],
  },
  {
    id: '50-30-20',
    category: 'Budgeting and income',
    q: 'What is the 50/30/20 rule?',
    keywords: ['50 30 20', '503020', 'fifty thirty twenty', 'budget rule'],
    answer: 'The 50/30/20 rule is a starting point for splitting take-home pay:\n• 50% for needs: rent, utilities, groceries, transportation, minimum loan payments.\n• 30% for wants: eating out, entertainment, subscriptions.\n• 20% for goals: savings and extra debt payments.\n\nIt’s a guideline, not a rule. In high-rent cities, needs often take more than 50%, so adjust and focus on the trend.',
    related: ['budget', 'needs-wants', 'rent'],
  },
  {
    id: 'needs-wants',
    category: 'Budgeting and income',
    q: 'How do I tell needs from wants?',
    keywords: ['needs and wants', 'needs vs wants', 'need or want', 'needs from wants', 'wants'],
    answer: 'A need is something you must pay to live and work: housing, basic groceries, utilities, transportation to work, insurance and minimum debt payments.\n\nA want improves life but could be cut: streaming, eating out, upgrades, travel.\n\nMany expenses are a mix. You need food, but takeout is partly a want. When money is tight, trimming the want part of needs often helps more than cutting things entirely.',
    related: ['50-30-20', 'cut-spending'],
  },
  {
    id: 'take-home-pay',
    category: 'Budgeting and income',
    q: 'What is take-home pay?',
    keywords: ['take home', 'takehome', 'net pay', 'gross pay', 'gross vs net', 'paycheck smaller', 'salary to monthly', 'after tax'],
    answer: 'Take-home pay (net pay) is what lands in your bank account after taxes, retirement contributions and benefits are taken out. Gross pay is the full salary before any of that.\n\nRough example: a $50,000 salary is about $4,167 a month gross, but take-home might be roughly $3,200–$3,500 depending on your state, benefits and retirement savings. Budget with take-home pay.',
    related: ['taxes-paycheck', 'budget', 'benefits'],
  },
  {
    id: 'taxes-paycheck',
    category: 'Budgeting and income',
    q: 'What taxes come out of my paycheck?',
    keywords: ['taxes', 'tax withholding', 'withholding', 'w4', 'w 4', 'fica', 'social security tax', 'medicare tax', 'tax refund', 'income tax'],
    answer: 'Common paycheck deductions:\n• Federal income tax, based on your W-4 and income.\n• State and sometimes local income tax (some states have none).\n• FICA: 6.2% for Social Security and 1.45% for Medicare, 7.65% total.\n\nYour W-4 tells your employer how much to withhold. Too little can mean a bill at tax time; too much means a refund, which is just your own money returned late.',
    related: ['take-home-pay', 'benefits', 'interest-deduction'],
  },
  {
    id: 'benefits',
    category: 'Budgeting and income',
    q: 'What job benefits should I pay attention to?',
    keywords: ['benefit', 'health insurance', 'deductible', 'premium', 'job offer', 'compare offers', 'hsa', 'fsa account'],
    answer: 'Benefits can be worth thousands a year, so compare them, not just salary:\n• Health insurance: the monthly premium, the deductible (what you pay before coverage kicks in), and the out-of-pocket maximum.\n• Retirement match: free money if you contribute.\n• Paid time off, and sometimes student loan repayment help.\n\nPremiums and retirement contributions come out before you’re paid, so they lower take-home pay.',
    related: ['retirement', 'take-home-pay'],
  },
  {
    id: 'rent',
    category: 'Budgeting and income',
    q: 'What’s a realistic share of income for rent?',
    keywords: ['rent', 'housing cost', 'apartment', 'how much house', 'roommate'],
    answer: 'A common guideline is to keep rent at or below about 30% of your gross income. Many landlords also look for income of about three times the rent.\n\nIn expensive cities, rent often runs higher. If yours does, it’s worth balancing elsewhere: a roommate, a cheaper area, or a smaller place. Remember utilities, renter’s insurance and deposits too.',
    related: ['50-30-20', 'budget', 'moving-costs'],
  },
  {
    id: 'moving-costs',
    category: 'Budgeting and income',
    q: 'What costs come with moving after graduation?',
    keywords: ['moving after graduation', 'costs come with moving', 'moving', 'move out', 'first apartment', 'security deposit', 'deposit', 'relocat', 'after graduation cost'],
    answer: 'Moving costs add up before your first paycheck. Common ones:\n• Security deposit plus first month’s rent, sometimes last month’s too.\n• Movers or a truck, plus travel.\n• Utility and internet setup fees.\n• Furniture and household basics.\n• Renter’s insurance.\n\nBudget for a gap between starting work and your first paycheck, which can take two to four weeks. The Delayed Job Start scenario in Money Lab helps you test that.',
    related: ['rent', 'emergency-fund', 'delay-scenario'],
  },
  {
    id: 'food',
    category: 'Budgeting and income',
    q: 'How much should I spend on food?',
    keywords: ['food', 'groceries', 'grocery', 'eating out', 'meal', 'takeout', 'dining'],
    answer: 'There’s no single right number. It depends on where you live and how you eat. Many single adults spend a few hundred dollars a month on groceries, and eating out can easily double that.\n\nTo find yours: track a month of food spending, then split it into groceries and eating out. Planning meals, cooking in batches and setting a weekly eating-out amount are the easiest ways to lower it.',
    related: ['cut-spending', 'needs-wants', 'budget'],
  },
  {
    id: 'cash-flow',
    category: 'Budgeting and income',
    q: 'What is cash flow?',
    keywords: ['cash flow', 'cashflow', 'left over', 'leftover', 'money in and out'],
    answer: 'Cash flow is money in minus money out over a month.\n\n• Positive: you have room to save, pay extra on debt, or handle surprises.\n• Negative: you’re spending more than you bring in, so the gap comes from savings or credit.\n\nFirstStep projects your post-graduation cash flow from your expected income, expenses and estimated loan payment. Ask “What is my cash flow?” to see yours.',
    related: ['budget', 'cut-spending', 'emergency-fund'],
  },
  {
    id: 'cut-spending',
    category: 'Budgeting and income',
    q: 'How can I cut my spending?',
    keywords: ['cut my spending', 'cut my', 'cut spending', 'cut back', 'spend less', 'save money on', 'reduce spending', 'reduce expenses', 'lower my bills', 'cut costs', 'subscription', 'overspend'],
    answer: 'Start with the biggest or easiest wins:\n• Cancel subscriptions you don’t use.\n• Cook more and plan groceries; food is often the most flexible category.\n• Shop around for phone, internet and insurance. Ask about student or new-customer rates.\n• Set a weekly fun-money amount instead of tracking every purchase.\n• Wait 24 hours before non-essential purchases.\n\nSmall changes add up. $50 a month is $600 a year.',
    related: ['needs-wants', 'budget', 'side-income'],
  },
  {
    id: 'side-income',
    category: 'Budgeting and income',
    q: 'How can I earn extra money?',
    keywords: ['side hustle', 'side income', 'extra money', 'extra income', 'second job', 'part time', 'gig', 'freelanc', 'earn more'],
    answer: 'Common ways students and new grads add income:\n• Part-time work, tutoring, or campus jobs.\n• Gig or freelance work using a skill you have.\n• Selling things you no longer use.\n• Asking about raises or overtime once you’re established.\n\nTwo things to watch: self-employment and gig income usually has no taxes taken out, so set aside a portion for taxes. And make sure extra work doesn’t hurt your grades or main job.',
    related: ['taxes-paycheck', 'cash-flow'],
  },
  {
    id: 'irregular-income',
    category: 'Budgeting and income',
    q: 'How do I budget with irregular income?',
    keywords: ['irregular income', 'variable income', 'income changes', 'tips income', 'commission', 'uneven income', 'inconsistent income'],
    answer: 'When income changes month to month:\n• Budget from your lowest typical month, not your best.\n• Cover essentials first, then goals, then wants.\n• In good months, move the extra into a buffer account.\n• Pay yourself a steady amount from that buffer.\n\nA larger emergency fund helps, since income dips are more likely.',
    related: ['budget', 'emergency-fund', 'side-income'],
  },

  // ───────── Saving
  {
    id: 'emergency-fund',
    category: 'Saving',
    q: 'How big should my emergency fund be?',
    keywords: ['emergency fund', 'emergency savings', 'rainy day', 'how much should i save', 'how much to save', 'emergenc'],
    answer: 'An emergency fund is savings you can reach quickly for surprises: a car repair, medical bill, or a gap in income.\n\nA common goal is three to six months of essential expenses. Start smaller: a first goal of $500–$1,000 covers many surprises, then build toward one month, then three.\n\nKeep it in a separate savings account so it’s easy to reach but not easy to spend. The Unexpected Expense scenario in Money Lab tests what yours can handle.',
    related: ['start-saving', 'high-yield', 'unexpected-scenario'],
  },
  {
    id: 'start-saving',
    category: 'Saving',
    q: 'How do I start saving when money is tight?',
    keywords: ['start saving', 'how to save', 'save more', 'saving money', 'cant save', 'pay yourself first', 'savings habit'],
    answer: 'Start small and make it automatic:\n• Set up an automatic transfer to savings on payday, even $10–$25.\n• Save windfalls like tax refunds, gifts or raises.\n• Round up purchases if your bank offers it.\n• Increase the amount a little whenever your income grows.\n\nThe habit matters more than the amount at first. Paying yourself first means saving before you spend, not saving what’s left.',
    related: ['emergency-fund', 'sinking-fund', 'high-yield'],
  },
  {
    id: 'high-yield',
    category: 'Saving',
    q: 'What is a high-yield savings account?',
    keywords: ['high yield', 'savings account', 'apy', 'interest on savings', 'where to keep savings', 'where should i keep'],
    answer: 'A high-yield savings account pays much more interest than a typical savings account. They’re often offered by online banks and credit unions.\n\nLook for:\n• FDIC (bank) or NCUA (credit union) insurance.\n• No monthly fees or minimums.\n• The APY, the yearly rate including compounding.\n\nIt’s a good home for an emergency fund: safe and easy to reach, but separate from your checking.',
    related: ['checking-savings', 'emergency-fund', 'fdic'],
  },
  {
    id: 'sinking-fund',
    category: 'Saving',
    q: 'What is a sinking fund?',
    keywords: ['sinking fund', 'save for a goal', 'saving for a goal', 'save for a car', 'save for vacation', 'big purchase', 'yearly expense', 'annual expense'],
    answer: 'A sinking fund is money you set aside a little at a time for a known future expense, like car insurance, holidays, a trip, or a new laptop.\n\nDivide the cost by the months until you need it. Example: a $600 expense in 6 months is $100 a month.\n\nIt keeps planned costs from becoming emergencies or credit card debt. FirstStep’s savings goals work the same way.',
    related: ['start-saving', 'emergency-fund', 'budget'],
  },
  {
    id: 'retirement',
    category: 'Saving',
    q: 'Should I save for retirement while paying loans?',
    keywords: ['retirement', '401k', '401 k', '403b', 'roth', 'ira', 'employer match', 'match'],
    answer: 'Many people do both. If your employer matches 401(k) or 403(b) contributions, contributing enough to get the full match is usually a priority, since it’s money you’d otherwise leave behind.\n\nStarting early matters because of compounding: small amounts in your 20s can grow a lot by retirement.\n\nI can explain how these accounts work, but I can’t recommend specific investments. For that, a fee-only financial planner can help.',
    related: ['compound-interest', 'save-vs-pay', 'benefits'],
  },
  {
    id: 'investing',
    category: 'Saving',
    q: 'How does investing work?',
    keywords: ['investing', 'invest', 'stock market', 'stocks', 'index fund', 'mutual fund', 'bonds'],
    answer: 'Investing means putting money into assets like stocks or bonds that can grow over time but can also lose value. Stocks are small pieces of companies; bonds are loans to governments or companies. Index funds hold many of them at once, which spreads out risk.\n\nGenerally, money you’ll need within a few years, like an emergency fund, belongs in savings, not investments.\n\nI can explain concepts, but I can’t recommend specific investments. A fee-only financial planner can.',
    related: ['retirement', 'compound-interest', 'save-vs-pay'],
  },
  {
    id: 'net-worth',
    category: 'Saving',
    q: 'What is net worth?',
    keywords: ['net worth', 'networth', 'assets', 'liabilities'],
    answer: 'Net worth is what you own minus what you owe.\n\nAssets: cash, savings, investments, and the value of things like a car.\nLiabilities: student loans, credit card balances and other debts.\n\nMany new graduates have a negative net worth because of student loans, and that’s normal. What matters is the direction: paying down debt and building savings both move it up over time.',
    related: ['principal', 'start-saving', 'good-debt'],
  },
  {
    id: 'inflation',
    category: 'Saving',
    q: 'What is inflation?',
    keywords: ['inflation', 'prices go up', 'cost of living', 'purchasing power'],
    answer: 'Inflation is the general rise in prices over time, so the same dollar buys less later.\n\nWhy it matters to you:\n• Money in a low-interest account loses buying power if inflation is higher than its interest rate.\n• Your budget may need yearly updates as costs rise.\n• Fixed-rate loan payments stay the same, so they get relatively easier as your pay grows.',
    related: ['high-yield', 'compound-interest'],
  },

  // ───────── Credit and debt
  {
    id: 'credit-score',
    category: 'Credit and debt',
    q: 'How does a credit score work?',
    keywords: ['credit score', 'fico', 'vantage', 'credit rating', 'raise my credit', 'improve my credit', 'build credit', 'good credit', 'bad credit'],
    answer: 'A credit score (usually 300–850) predicts how likely you are to repay debt. Lenders, landlords and some employers use it.\n\nThe biggest factors:\n• Payment history: paying on time, every time.\n• Credit utilization: how much of your card limits you use.\n• Length of history, mix of credit, and new applications.\n\nTo build it: pay every bill on time, keep card balances low, and keep old accounts open. Student loans paid on time help build your score.',
    related: ['credit-report', 'utilization', 'credit-card'],
  },
  {
    id: 'credit-report',
    category: 'Credit and debt',
    q: 'How do I check my credit report?',
    keywords: ['credit report', 'annualcreditreport', 'check my credit', 'credit bureau', 'equifax', 'experian', 'transunion', 'credit freeze', 'freeze my credit'],
    answer: 'Your credit report lists your loans, cards, payment history and inquiries. You can get free reports from Equifax, Experian and TransUnion at AnnualCreditReport.com, the official free site.\n\nCheck for accounts you don’t recognize and dispute errors with the bureau. A credit freeze, which is free, stops anyone from opening new credit in your name. You can lift it when you need to apply.',
    related: ['credit-score', 'identity-theft'],
  },
  {
    id: 'credit-card',
    category: 'Credit and debt',
    q: 'How do credit cards work?',
    keywords: ['grace period on a credit card', 'credit card grace', 'credit card', 'first card', 'get a card', 'statement balance', 'card works'],
    answer: 'A credit card lets you borrow up to a limit and pay it back later. Each month you get a statement:\n\n• Pay the full statement balance by the due date and you usually pay no interest.\n• Pay less and the rest is charged interest at the card’s APR, often 20% or more.\n\nUsed carefully, a card builds credit. A good habit is to charge only what you’d pay in cash anyway and pay it off in full every month.',
    related: ['minimum-payment', 'utilization', 'credit-card-interest'],
  },
  {
    id: 'credit-card-emergencies',
    category: 'Credit and debt',
    q: 'Should I use a credit card for emergencies?',
    keywords: ['credit card for emergenc', 'card for emergenc', 'emergency on a credit card', 'emergencies on credit', 'emergency credit card'],
    answer: 'A credit card can cover an emergency in a pinch, but it’s expensive backup. At 24% APR, a $1,000 emergency paid off at $50 a month takes a little over two years and costs about $290 in interest.\n\nAn emergency fund is cheaper and less stressful. If you do use a card, pay it down as quickly as you can and pause other extra spending until it’s gone.',
    related: ['emergency-fund', 'credit-card-interest', 'minimum-payment'],
  },
  {
    id: 'minimum-payment',
    category: 'Credit and debt',
    q: 'What happens if I only pay the minimum on a credit card?',
    keywords: ['minimum payment', 'pay the minimum', 'only pay the minimum', 'just the minimum', 'minimum due'],
    answer: 'Paying only the minimum keeps your account in good standing, but the rest of the balance is charged interest, and it can take years to pay off.\n\nExample: $2,000 at 24% APR with a minimum of about $60 a month takes over four and a half years and costs about $1,300 in interest. Paying even a bit more than the minimum shortens that a lot. Always pay at least the minimum on time to protect your credit.',
    related: ['credit-card-interest', 'avalanche-snowball', 'credit-card'],
  },
  {
    id: 'credit-card-interest',
    category: 'Credit and debt',
    q: 'How do I get out of credit card debt?',
    keywords: ['credit card debt', 'card debt', 'get out of debt', 'pay off debt', 'pay off my credit', 'balance transfer', 'debt free'],
    answer: 'A plan that works for many people:\n1. Stop adding new charges to the card.\n2. Pay the minimum on everything, then put every extra dollar on the highest-rate card (avalanche) or the smallest balance (snowball).\n3. Call your card company and ask for a lower rate.\n4. A balance transfer card with 0% for a set period can help, but watch the transfer fee and the rate after it ends.\n\nIf it feels unmanageable, a nonprofit credit counselor (NFCC.org) can help for free or low cost.',
    related: ['avalanche-snowball', 'minimum-payment', 'apr'],
  },
  {
    id: 'utilization',
    category: 'Credit and debt',
    q: 'What is credit utilization?',
    keywords: ['utilization', 'utilisation', 'credit limit', 'how much of my limit'],
    answer: 'Credit utilization is how much of your credit card limits you’re using. Example: a $300 balance on a $1,000 limit is 30%.\n\nLower is better for your score. A common guideline is staying under 30%, and under 10% is even better. Paying your balance before the statement date, or asking for a higher limit (without spending more), lowers it.',
    related: ['credit-score', 'credit-card'],
  },
  {
    id: 'car-loan',
    category: 'Credit and debt',
    q: 'What should I know before getting a car loan?',
    keywords: ['car loan', 'auto loan', 'buy a car', 'buying a car', 'lease', 'collateral', 'secured loan', 'unsecured'],
    answer: 'A car loan is a secured loan: the car is collateral, so it can be repossessed if you stop paying.\n\nBefore you sign:\n• Get pre-approved by a bank or credit union so you can compare with the dealer’s offer.\n• Look at the total cost, not just the monthly payment. Longer loans (72–84 months) cost more interest.\n• Budget for insurance, gas, maintenance and registration too.\n• A bigger down payment means a smaller loan.\n\nThe payment adds to your student loan payment, so check your cash flow first.',
    related: ['apr', 'total-interest', 'cash-flow'],
  },
  {
    id: 'debit-vs-credit',
    category: 'Credit and debt',
    q: 'What is the difference between a debit card and a credit card?',
    keywords: ['difference between a debit', 'debit card and a credit card', 'debit card', 'debit or credit', 'debit vs credit', 'debit and credit', 'debit'],
    answer: 'A debit card spends money already in your checking account. There’s no bill and no interest, but it doesn’t build credit, and overspending can trigger overdraft fees.\n\nA credit card borrows money you repay later. Paid in full each month, it costs nothing and builds credit. Carried balances are charged high interest.\n\nCredit cards also tend to have stronger fraud protection, since a thief spends the bank’s money, not yours.',
    related: ['credit-card', 'overdraft', 'credit-score'],
  },
  {
    id: 'bnpl',
    category: 'Credit and debt',
    q: 'Is buy now, pay later a good idea?',
    keywords: ['buy now pay later', 'bnpl', 'afterpay', 'klarna', 'affirm', 'pay in 4', 'installment'],
    answer: 'Buy now, pay later splits a purchase into installments, often four payments with no interest if you pay on time. It’s still debt.\n\nWatch out for:\n• Late fees, and interest on longer plans.\n• Stacking several plans that add up to more than you realize.\n• Payments coming out automatically when your account is low.\n\nIf you couldn’t afford it in cash, splitting it up usually just delays the problem.',
    related: ['credit-card', 'overdraft', 'budget'],
  },
  {
    id: 'payday-loans',
    category: 'Credit and debt',
    q: 'What are payday loans?',
    keywords: ['payday loan', 'cash advance', 'title loan', 'quick loan', 'short term loan'],
    answer: 'Payday loans are small, short-term loans due on your next payday. Their fees often work out to an APR of 300% or more, and many borrowers end up taking new loans to repay old ones.\n\nBetter options in a pinch: ask a creditor for a payment plan, a credit union’s small-dollar loan, your school’s emergency fund, or community assistance programs.',
    related: ['emergency-fund', 'apr', 'cant-pay'],
  },
  {
    id: 'good-debt',
    category: 'Credit and debt',
    q: 'Is there good debt and bad debt?',
    keywords: ['bad to have debt', 'have debt', 'good debt', 'bad debt', 'is debt bad', 'worth it', 'too much debt'],
    answer: 'People often call debt “good” when it helps you build long-term value at a reasonable cost, like education or a home, and “bad” when it pays for things that lose value at high cost, like credit card balances for everyday wants.\n\nA more useful question: can you afford the payment, and what does it cost in total? Even “good” debt becomes a problem if the payment strains your budget.',
    related: ['interest', 'cash-flow', 'credit-card-interest'],
  },

  // ───────── Banking and safety
  {
    id: 'checking-savings',
    category: 'Banking and safety',
    q: 'What is the difference between checking and savings?',
    keywords: ['checking', 'checking account', 'checking and savings', 'checking vs savings', 'bank account', 'open an account', 'credit union', 'which bank'],
    answer: 'A checking account is for everyday spending: your debit card, bills and paycheck. A savings account holds money you don’t plan to spend right away and pays interest.\n\nA simple setup: paycheck into checking, an automatic transfer to savings, and bills paid from checking. Look for accounts with no monthly fees. Credit unions and online banks often have fewer fees.',
    related: ['high-yield', 'overdraft', 'fdic'],
  },
  {
    id: 'overdraft',
    category: 'Banking and safety',
    q: 'What is an overdraft fee?',
    keywords: ['overdraft', 'overdraw', 'insufficient funds', 'nsf', 'bounced', 'negative balance'],
    answer: 'An overdraft happens when you spend more than is in your checking account. Some banks cover the charge and add a fee, often around $30 or more.\n\nTo avoid them:\n• Opt out of overdraft coverage, so a card purchase is declined instead.\n• Set low-balance alerts in your banking app.\n• Link savings as a backup, if your bank offers free transfers.\n• Time automatic payments after payday.',
    related: ['checking-savings', 'autopay', 'budget'],
  },
  {
    id: 'fdic',
    category: 'Banking and safety',
    q: 'Is my money safe in a bank?',
    keywords: ['fdic', 'ncua', 'insured', 'safe in a bank', 'money safe', 'bank fail'],
    answer: 'At FDIC-insured banks and NCUA-insured credit unions, deposits are protected up to $250,000 per depositor, per institution, for each ownership category. If the bank fails, insured money is returned to you.\n\nSome apps and fintech companies aren’t banks themselves, so check that your money is held at an insured bank. Investments like stocks aren’t covered by this insurance.',
    related: ['checking-savings', 'high-yield'],
  },
  {
    id: 'scams',
    category: 'Banking and safety',
    priority: 10,
    q: 'How do I avoid student loan scams?',
    keywords: ['is that a scam', 'is this a scam', 'is it a scam', 'for a fee', 'charging a fee', 'scam', 'fraud', 'debt relief', 'too good to be true', 'company called me', 'loan help company', 'pay for help'],
    answer: 'Warning signs of a student loan scam:\n• Upfront or monthly fees to lower your payment, consolidate, or get forgiveness. These are free through your servicer and StudentAid.gov.\n• Pressure to act immediately, or promises of instant forgiveness.\n• Asking for your FSA ID or password.\n• Contact from someone who isn’t your servicer or the Department of Education.\n\nIf unsure, hang up and call your servicer using the number on StudentAid.gov. Report scams at ReportFraud.ftc.gov.',
    related: ['fsa-id', 'identity-theft', 'servicer'],
  },
  {
    id: 'identity-theft',
    category: 'Banking and safety',
    q: 'How do I protect myself from identity theft?',
    keywords: ['identity theft', 'identity', 'stolen', 'phishing', 'protect my information', 'data breach', 'hacked'],
    answer: 'Simple protections that go a long way:\n• Use strong, unique passwords and turn on two-factor authentication for banking and StudentAid.gov.\n• Never share codes, passwords or your SSN with someone who contacts you first.\n• Check bank statements and your credit report regularly.\n• Freeze your credit for free with all three bureaus.\n\nIf it happens, IdentityTheft.gov gives you a step-by-step recovery plan.',
    related: ['credit-report', 'scams'],
  },

  // ───────── Using FirstStep
  {
    id: 'data-labels',
    category: 'Using FirstStep',
    q: 'What do imported, estimated and confirmed mean?',
    keywords: ['imported', 'estimated', 'confirmed', 'hypothetical', 'label', 'badge', 'verified'],
    answer: 'FirstStep labels every number so you know where it came from:\n• Imported: from your StudentAid.gov file or a connected account.\n• Estimated: calculated by FirstStep from assumptions, and not official.\n• Confirmed or verified: you checked it.\n• Hypothetical: from a Money Lab scenario; never saved to your real budget.\n\nFirstStep never overwrites your data silently. Confirming numbers also raises your readiness score.',
    related: ['readiness', 'payment-estimate'],
  },
  {
    id: 'readiness',
    category: 'Using FirstStep',
    q: 'How is my readiness score calculated?',
    keywords: ['readiness', 'score go up', 'readiness score', 'meter', 'milestone', 'habit'],
    answer: 'Your readiness score has four parts worth 25 points each:\n• Understand and verify your loans: adding them, checking them against your servicer, and recording your first payment date.\n• Review your budget: income, expenses, a spending review and a confirmed summary.\n• Create a repayment strategy: a payment estimate and Money Lab scenarios.\n• Keep up money habits: a savings goal and weekly habits, up to three a week.\n\nOnly real actions count, and your score never drops for missing a day. Your dashboard shows the next step that will raise it most.',
    related: ['data-labels', 'practice-payment'],
  },
  {
    id: 'payment-estimate',
    category: 'Using FirstStep',
    q: 'How is my loan payment estimated?',
    keywords: ['what is my payment', 'payment estimated', 'estimate my payment', 'how is my payment', 'payment calculated', 'estimate calculated'],
    answer: 'FirstStep calculates each loan’s payment from its recorded balance and interest rate with a standard amortization formula. If no repayment term is entered, it assumes a fixed 10-year (120-month) schedule.\n\nThat is an estimate, not your official bill. Your servicer sets the real amount, and it can be different, especially on an income-based plan. Loans missing a balance or rate are left out and flagged.',
    related: ['amortization', 'repayment-plans', 'data-labels'],
  },
  {
    id: 'practice-payment',
    category: 'Using FirstStep',
    q: 'What does it mean to practice a payment?',
    keywords: ['practice', 'practice payment', 'practicing'],
    answer: 'Practicing a payment means moving your estimated loan payment into savings each month before repayment starts, as if you were already paying.\n\nIt shows whether your budget can handle the real thing, and you end up with savings either way. The Practice Payment scenario in Money Lab shows how much you’d have by your first due date.',
    related: ['grace-period', 'first-payment', 'emergency-fund'],
  },
  {
    id: 'delay-scenario',
    category: 'Using FirstStep',
    q: 'What does the delayed job scenario show?',
    keywords: ['delayed job', 'delayed employment', 'delay scenario', 'job takes longer', 'without a job'],
    answer: 'The Delayed Job Start scenario tests what happens if your first paycheck comes later than planned. It runs your savings month by month with no new income and shows if, and when, you’d run short.\n\nIt’s practice only and doesn’t change your saved budget. If it shows a gap, building your emergency fund or lowering costs before graduation can close it.',
    related: ['emergency-fund', 'cant-pay', 'moving-costs'],
  },
  {
    id: 'unexpected-scenario',
    category: 'Using FirstStep',
    q: 'What does the unexpected expense scenario show?',
    keywords: ['unexpected expense', 'surprise expense', 'unexpected scenario', 'car repair', 'medical bill'],
    answer: 'The Unexpected Expense scenario tests a surprise cost, like a car repair or medical bill, against your savings and cash flow. It shows whether savings could cover it and how long it would take to rebuild.\n\nIt’s practice only and never changes your real numbers. If the result is tight, it’s a sign to build your emergency fund.',
    related: ['emergency-fund', 'credit-card-emergencies'],
  },
];

export const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

/** Lowercase, straight apostrophes removed, punctuation turned to spaces. */
export function normalizeQuestion(text: string) {
  return ` ${text
    .toLowerCase()
    .replace(/[’‘'`]/g, '')
    .replace(/[^a-z0-9$%]+/g, ' ')
    .trim()} `;
}

const keywordCache = new Map<string, RegExp>();
function keywordPattern(k: string) {
  let re = keywordCache.get(k);
  if (!re) {
    const norm = normalizeQuestion(k).trim().replace(/[$%]/g, (c) => `\\${c}`);
    re = new RegExp(`(^|\\s)${norm}`);
    keywordCache.set(k, re);
  }
  return re;
}

/** Returns the best-matching topic, or null when nothing in the library fits. */
export function matchTopic(question: string): CoachTopic | null {
  const q = normalizeQuestion(question);
  let best: CoachTopic | null = null;
  let bestScore = 0;
  for (const t of TOPICS) {
    // The longest matching phrase decides; extra matches only break ties.
    let longest = 0;
    let count = 0;
    for (const k of t.keywords) {
      if (!keywordPattern(k).test(q)) continue;
      longest = Math.max(longest, normalizeQuestion(k).trim().length);
      count++;
    }
    const score = longest ? longest + count * 0.1 + (t.priority ?? 0) : 0;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}
