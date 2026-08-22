import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, getRiskColor } from '../src/lib/index.js';

test('formatDate formats a date in Turkish locale', () => {
  const result = formatDate('2024-01-02T03:04:05Z');
  assert.match(result, /2\s+Ocak\s+2024/);
  assert.match(result, /\d{2}:\d{2}/);
});

test('formatDate keeps the Turkish locale formatting for a local date string', () => {
  const result = formatDate('2024-05-15T12:30:00');
  assert.match(result, /15\s+May/);
  assert.match(result, /2024/);
  assert.match(result, /\d{2}:\d{2}/);
});

test('getRiskColor returns red styles for high risk values', () => {
  assert.equal(getRiskColor('high'), 'text-red-600 bg-red-50');
  assert.equal(getRiskColor('YUKSEK'), 'text-red-600 bg-red-50');
  assert.equal(getRiskColor('yüksek'), 'text-red-600 bg-red-50');
  assert.equal(getRiskColor('YÜKSEK'), 'text-red-600 bg-red-50');
});

test('getRiskColor returns yellow styles for medium risk values', () => {
  assert.equal(getRiskColor('medium'), 'text-yellow-600 bg-yellow-50');
  assert.equal(getRiskColor('ORTA'), 'text-yellow-600 bg-yellow-50');
  assert.equal(getRiskColor('orta'), 'text-yellow-600 bg-yellow-50');
});

test('getRiskColor returns green styles for low risk values', () => {
  assert.equal(getRiskColor('low'), 'text-green-600 bg-green-50');
  assert.equal(getRiskColor('DUSUK'), 'text-green-600 bg-green-50');
  assert.equal(getRiskColor('düşük'), 'text-green-600 bg-green-50');
  assert.equal(getRiskColor('DÜŞÜK'), 'text-green-600 bg-green-50');
});

test('getRiskColor returns default styles for unknown values', () => {
  assert.equal(getRiskColor('unknown'), 'text-gray-600 bg-gray-50');
  assert.equal(getRiskColor(null), 'text-gray-600 bg-gray-50');
  assert.equal(getRiskColor(undefined), 'text-gray-600 bg-gray-50');
  assert.equal(getRiskColor(''), 'text-gray-600 bg-gray-50');
});
