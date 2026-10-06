import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCurrency, formatVndInput, parseVndInput } from './formatters.ts';

test('formats whole VND amounts for editing and display', () => {
  assert.equal(formatVndInput(1_250_000), '1.250.000');
  assert.match(formatCurrency(1_250_000), /1\.250\.000/);
  assert.match(formatCurrency(1_250_000), /₫/);
});

test('parses only safe whole-number VND amounts', () => {
  assert.equal(parseVndInput('1.250.000'), 1_250_000);
  assert.equal(parseVndInput(''), 0);
  assert.equal(parseVndInput('9'.repeat(20)), null);
});
