// Domain types shared by the server and the browser app.
// Five data categories stay separate (see README "Data categories"):
//   raw imports (LoanImport.raw, Transaction), user-edited/confirmed data (Loan, IncomeSource,
//   ExpenseCategory, SavingsAccount, FinancialSummary), calculated metrics (Plan.metrics),
//   hypothetical scenarios (Scenario), and generated tasks (Task).

export type ISODate = string; // yyyy-mm-dd
export type ISODateTime = string;

/** Where a value came from. "verified" is only set by the user after checking their official servicer account. */
export type DataSource = 'imported' | 'manual' | 'estimated' | 'verified' | 'connected' | 'demo';
export type DateStatus = 'confirmed' | 'user_entered' | 'estimated' | 'unknown';
export type StepStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped' | 'needs_attention';

export const ONBOARDING_STEPS = ['graduation', 'loans', 'connections', 'summary', 'plan'] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];

export type GraduationStatus = 'planning' | 'soon' | 'graduated';
export type EmploymentStatus = 'student' | 'unemployed' | 'part_time' | 'full_time' | 'offer_accepted' | 'other';

export interface Profile {
  id: string; // = userId
  userId: string;
  email: string;
  displayName: string | null;
  graduationDate: ISODate | null;
  graduationStatus: GraduationStatus | null;
  school: string | null;
  employmentStatus: EmploymentStatus | null;
  expectedEmploymentStart: ISODate | null;
  isDemo: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Onboarding {
  id: string; // = userId
  userId: string;
  steps: Record<OnboardingStepKey, StepStatus>;
  completedAt: ISODateTime | null;
  updatedAt: ISODateTime;
}

export interface Loan {
  id: string;
  userId: string;
  name: string;
  loanType: string | null; // e.g. "Direct Unsubsidized"
  category: 'federal' | 'private' | 'unknown';
  /** Outstanding principal only. */
  principal: number | null;
  /** Outstanding (unpaid) interest, kept separate from principal. */
  interestBalance: number | null;
  balanceAsOf: ISODate | null;
  interestRate: number | null; // annual percent, e.g. 5.5
  rateType: string | null; // FIXED / VARIABLE
  status: string | null;
  repaymentPlan: string | null;
  servicer: string | null;
  disbursementDate: ISODate | null;
  repaymentBeginDate: ISODate | null;
  nextPaymentDueDate: ISODate | null;
  gracePeriodEnd: ISODate | null;
  gracePeriodEndStatus: DateStatus;
  firstPaymentDate: ISODate | null;
  firstPaymentDateStatus: DateStatus;
  /** Repayment term the user wants to assume for estimates (months). Null = app default assumption. */
  termMonths: number | null;
  source: DataSource;
  importId: string | null;
  /** Position of this loan in the import's raw list, so imported and current values can be compared. */
  importIndex: number | null;
  notes: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type IncomeStatus = 'confirmed' | 'estimated' | 'variable' | 'not_available';
export interface IncomeSource {
  id: string;
  userId: string;
  label: string;
  /** current = income today; expected = projected after graduation */
  kind: 'current' | 'expected';
  monthlyAmount: number | null;
  status: IncomeStatus;
  source: DataSource;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export const EXPENSE_KEYS = [
  'housing',
  'utilities',
  'groceries',
  'dining',
  'transportation',
  'insurance_health',
  'phone_internet',
  'subscriptions',
  'shopping',
  'debt_payments',
  'other',
] as const;
export type ExpenseKey = (typeof EXPENSE_KEYS)[number];
export const EXPENSE_LABELS: Record<ExpenseKey, string> = {
  housing: 'Housing and rent',
  utilities: 'Utilities',
  groceries: 'Groceries',
  dining: 'Dining out',
  transportation: 'Transportation',
  insurance_health: 'Insurance and healthcare',
  phone_internet: 'Phone and internet',
  subscriptions: 'Subscriptions',
  shopping: 'Shopping and personal',
  debt_payments: 'Debt and loan payments',
  other: 'Other expenses',
};
export const FIXED_KEYS: ExpenseKey[] = ['housing', 'utilities', 'insurance_health', 'phone_internet', 'subscriptions'];

export type CategoryStatus = 'confirmed' | 'estimated' | 'needs_review';
export interface ExpenseCategory {
  id: string;
  userId: string;
  key: ExpenseKey;
  /** current budget vs. expected post-graduation budget */
  scope: 'current' | 'post_grad';
  monthlyAmount: number | null;
  status: CategoryStatus;
  source: DataSource;
  /** Total seen in reviewed transactions and the number of months they cover (actuals, not a forecast). */
  observedTotal: number | null;
  observedMonths: number | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SavingsAccount {
  id: string;
  userId: string;
  label: string;
  balance: number | null;
  accessibleForEmergencies: boolean;
  excluded: boolean;
  source: DataSource;
  connectionAccountId: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SavingsGoal {
  id: string;
  userId: string;
  label: string;
  targetAmount: number;
  targetDate: ISODate | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Budget-level settings that are not a category. */
export interface BudgetSettings {
  id: string; // = userId
  userId: string;
  monthlySavingsContribution: number | null;
  /** True when the "Debt and loan payments" category already includes student loan payments. Prevents double counting. */
  studentLoanPaymentInExpenses: boolean;
  /** Repayment term assumed when a loan has no term of its own. */
  defaultTermMonths: number;
  updatedAt: ISODateTime;
}

export interface Transaction {
  id: string;
  userId: string;
  connectionId: string | null;
  accountId: string | null;
  date: ISODate;
  description: string;
  /** Positive = money out (expense), negative = money in (deposit). Matches Plaid's sign convention. */
  amount: number;
  suggestedCategory: ExpenseKey | 'income' | 'transfer' | null;
  category: ExpenseKey | 'income' | 'transfer' | 'uncategorized';
  excluded: boolean;
  oneTime: boolean;
  reviewed: boolean;
  source: DataSource;
  createdAt: ISODateTime;
}

export type ConnectionStatus = 'not_connected' | 'connecting' | 'connected' | 'needs_attention' | 'disconnected';
export interface ConnectionAccount {
  accountId: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  balance: number | null;
  included: boolean;
}
export interface Connection {
  id: string;
  userId: string;
  provider: 'plaid';
  kind: 'bank' | 'loan_servicer';
  status: ConnectionStatus;
  institutionName: string | null;
  itemId: string | null;
  accounts: ConnectionAccount[];
  lastSyncedAt: ISODateTime | null;
  error: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ImportWarning {
  loanIndex: number | null;
  field: string | null;
  message: string;
}
export interface ParsedLoan {
  loanTypeCode: string | null;
  loanTypeDescription: string | null;
  schoolName: string | null;
  loanDate: ISODate | null;
  loanAmount: number | null;
  disbursedAmount: number | null;
  principal: number | null;
  principalAsOf: ISODate | null;
  interestBalance: number | null;
  interestAsOf: ISODate | null;
  interestRate: number | null;
  rateType: string | null;
  repaymentPlan: string | null;
  repaymentBeginDate: ISODate | null;
  nextPaymentDueDate: ISODate | null;
  status: string | null;
  servicer: string | null;
  disbursements: { date: ISODate | null; amount: number | null }[];
}
export interface LoanImport {
  id: string;
  userId: string;
  /** studentaid_file = uploaded MyStudentData.txt; plaid_liabilities = pulled from a connected servicer. */
  origin: 'studentaid_file' | 'plaid_liabilities';
  fileName: string;
  importedAt: ISODateTime;
  status: 'parsed' | 'failed' | 'confirmed' | 'discarded';
  fileRequestDate: string | null;
  loanCount: number;
  warnings: ImportWarning[];
  errors: string[];
  /** Raw parsed loans as they came from the file. Never edited. */
  raw: ParsedLoan[];
}

export interface SummarySnapshot {
  currentIncome: number | null;
  expectedIncome: number | null;
  currentExpenses: number | null;
  postGradExpenses: number | null;
  accessibleSavings: number | null;
  totalLoanBalance: number | null;
  categoryStatuses: Record<string, CategoryStatus>;
  missing: string[];
  discrepancies: string[];
}
export interface FinancialSummary {
  id: string;
  userId: string;
  confirmedAt: ISODateTime;
  snapshot: SummarySnapshot;
}

export type TaskStage = 'understand' | 'practice' | 'prepare';
export type TaskPriority = 'high' | 'medium' | 'low';
export interface Task {
  id: string;
  userId: string;
  planId: string | null;
  key: string;
  stage: TaskStage;
  title: string;
  reason: string;
  priority: TaskPriority;
  status: 'open' | 'done';
  dueDate: ISODate | null;
  link: string;
  completedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export type PrepStage = 'in_school' | 'grace_period' | 'repayment' | 'unknown';
export interface PlanMetrics {
  totalPrincipal: number | null;
  totalInterestBalance: number | null;
  totalBalance: number | null;
  loansCounted: number;
  loansMissingBalance: number;
  estimatedMonthlyPayment: number | null;
  paymentMissing: string[];
  currentIncome: number | null;
  expectedIncome: number | null;
  currentExpenses: number | null;
  postGradExpenses: number | null;
  currentCashFlow: number | null;
  projectedCashFlow: number | null;
  accessibleSavings: number | null;
  dataCompleteness: number; // 0-100
}
export interface Plan {
  id: string;
  userId: string;
  summaryId: string;
  generatedAt: ISODateTime;
  status: 'ready' | 'failed';
  stage: PrepStage;
  metrics: PlanMetrics;
  missing: string[];
  uncertainties: string[];
  recommendations: { title: string; detail: string; link: string }[];
  error: string | null;
}

export type ScenarioType = 'lifestyle' | 'delayed_employment' | 'unexpected' | 'practice_payment' | 'repayment_compare';
export interface Scenario {
  id: string;
  userId: string;
  name: string;
  type: ScenarioType;
  inputs: Record<string, unknown>;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface LearningProgress {
  id: string;
  userId: string;
  moduleId: string;
  completed: boolean;
  quizCorrect: boolean | null;
  attempts: number;
  completedAt: ISODateTime | null;
  updatedAt: ISODateTime;
}

export interface Notification {
  id: string;
  userId: string;
  kind: 'task' | 'date' | 'onboarding' | 'savings' | 'review';
  title: string;
  body: string;
  dedupeKey: string;
  createdAt: ISODateTime;
  readAt: ISODateTime | null;
}

export interface NotificationPrefs {
  id: string; // = userId
  userId: string;
  tasks: boolean;
  dates: boolean;
  onboarding: boolean;
  savings: boolean;
  review: boolean;
  emailOptIn: boolean;
  updatedAt: ISODateTime;
}

export interface Activity {
  id: string;
  userId: string;
  at: ISODateTime;
  message: string;
}

/** Per-user engagement state for the readiness meter (one row per user). */
export interface Engagement {
  id: string; // = userId
  userId: string;
  /** Highest milestone already celebrated (0, 25, 50, 75 or 100). Only ever increases. */
  celebratedMilestone: number;
  lastSeenAt: string | null;
  /** The visit before the current one, used for a "welcome back" note. */
  previousSeenAt: string | null;
  /** Celebration messages the user has dismissed. */
  dismissed: string[];
  updatedAt: string;
}
