export const CATEGORY_POLICY_LIMIT_CENTS = {
  travel: 1_000_000,
  meals: 200_000,
  supplies: 500_000,
  lodging: 800_000,
  other: 500_000,
} as const;

type PolicyCategory = keyof typeof CATEGORY_POLICY_LIMIT_CENTS;

const CATEGORY_LABELS: Record<PolicyCategory, string> = {
  travel: 'Travel',
  meals: 'Meals',
  supplies: 'Supplies',
  lodging: 'Lodging',
  other: 'Other',
};

export type ExpenseLinePolicyWarning = {
  category: PolicyCategory;
  limit_cents: number;
  message: string;
};

function isPolicyCategory(category: string): category is PolicyCategory {
  return category in CATEGORY_POLICY_LIMIT_CENTS;
}

function formatRupeeLimit(cents: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function getExpenseLinePolicyWarning(line: {
  amount_cents: number;
  category: string;
}): ExpenseLinePolicyWarning | null {
  if (!isPolicyCategory(line.category)) return null;

  const limitCents = CATEGORY_POLICY_LIMIT_CENTS[line.category];
  if (line.amount_cents <= limitCents) return null;

  return {
    category: line.category,
    limit_cents: limitCents,
    message: `${CATEGORY_LABELS[line.category]} expense exceeds the ${formatRupeeLimit(limitCents)} category limit.`,
  };
}
