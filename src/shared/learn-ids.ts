export const LEARN_MODULE_IDS = [
  'understanding-student-loans',
  'federal-vs-private',
  'understanding-interest',
  'interest-capitalization',
  'post-grad-budget',
  'take-home-pay',
  'emergency-fund',
  'understanding-repayment-plans',
  'missed-payments',
  'preparing-first-payment',
];

/** Grace-period checklist (Loan Planner). Stored as tasks with keys prefixed "checklist_". */
export const GRACE_CHECKLIST = [
  { key: 'checklist_review_details', title: 'Review loan details', link: '/app/finances' },
  { key: 'checklist_confirm_types', title: 'Confirm loan types and balances', link: '/app/finances' },
  { key: 'checklist_grace_end', title: 'Confirm the grace-period end date', link: '/app/loan-planner' },
  { key: 'checklist_first_payment', title: 'Find the first payment date', link: '/app/loan-planner' },
  { key: 'checklist_options', title: 'Review repayment options', link: '/app/learn/understanding-repayment-plans' },
  { key: 'checklist_affordability', title: 'Estimate monthly affordability', link: '/app/money-lab?tab=practice' },
  { key: 'checklist_savings_target', title: 'Set a savings target', link: '/app/finances#savings' },
  { key: 'checklist_servicer_mail', title: 'Review servicer communications', link: '/app/loan-planner' },
  { key: 'checklist_reminders', title: 'Set reminders', link: '/app/settings#notifications' },
] as const;
