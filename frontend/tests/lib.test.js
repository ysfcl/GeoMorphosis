import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, getRiskColor } from '../src/lib/index.js';

test('formatDate formats a date in Turkish locale', () => {
  const result = formatDate('2024-01-02T03:04:05Z');
  assert.match(result, /2/);
  assert.match(result, /Ocak/);
});

test('getRiskColor returns red styles for high risk values', () => {
  assert.equal(getRiskColor('high'), 'text-red-600 bg-red-50');
  assert.equal(getRiskColor('YUKSEK'), 'text-red-600 bg-red-50');
});

test('getRiskColor returns yellow styles for medium risk values', () => {
  assert.equal(getRiskColor('medium'), 'text-yellow-600 bg-yellow-50');
});

test('getRiskColor returns green styles for low risk values', () => {
  assert.equal(getRiskColor('low'), 'text-green-600 bg-green-50');
});

test('getRiskColor returns default styles for unknown values', () => {
  assert.equal(getRiskColor('unknown'), 'text-gray-600 bg-gray-50');
});
