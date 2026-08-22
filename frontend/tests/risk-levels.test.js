import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RISK_PERCENT,
  normalizeRisk,
  formatRiskShare,
} from '../src/lib/riskLevels.js';

test('"yok" yalnizca %0 iken soylenir, aksi halde yuzde doner', () => {
  assert.equal(formatRiskShare('yok'), 'Yok');
  assert.equal(formatRiskShare(undefined), 'Yok');
  assert.equal(formatRiskShare(''), 'Yok');

  assert.equal(formatRiskShare('dusuk'), '%28');
  assert.equal(formatRiskShare('orta'), '%58');
  assert.equal(formatRiskShare('YUKSEK'), '%90');
});

test('normalizeRisk eksik degerleri "yok" a indirger', () => {
  assert.equal(normalizeRisk(null), 'yok');
  assert.equal(normalizeRisk(' ORTA '), 'orta');
});

test('RISK_PERCENT tablosunda yok sifirdir', () => {
  assert.equal(RISK_PERCENT.yok, 0);
});
