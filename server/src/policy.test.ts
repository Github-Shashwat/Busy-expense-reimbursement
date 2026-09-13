import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getExpenseLinePolicyWarning } from './policy.js';

describe('expense line policy warnings', () => {
  it('does not warn below or exactly at the category limit', () => {
    assert.equal(getExpenseLinePolicyWarning({ category: 'meals', amount_cents: 199_999 }), null);
    assert.equal(getExpenseLinePolicyWarning({ category: 'meals', amount_cents: 200_000 }), null);
  });

  it('warns when the amount exceeds the category limit', () => {
    assert.deepEqual(getExpenseLinePolicyWarning({ category: 'meals', amount_cents: 200_001 }), {
      category: 'meals',
      limit_cents: 200_000,
      message: 'Meals expense exceeds the ₹2,000 category limit.',
    });
  });

  it('uses the limit for the selected category', () => {
    assert.equal(getExpenseLinePolicyWarning({ category: 'travel', amount_cents: 1_000_000 }), null);
    assert.deepEqual(getExpenseLinePolicyWarning({ category: 'travel', amount_cents: 1_000_001 }), {
      category: 'travel',
      limit_cents: 1_000_000,
      message: 'Travel expense exceeds the ₹10,000 category limit.',
    });
  });
});
