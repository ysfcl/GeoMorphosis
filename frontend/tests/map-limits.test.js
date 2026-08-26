import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_ANALYSIS_RADIUS_M,
  MAX_ANALYSIS_RADIUS_M,
  deriveRadiusFromArea,
} from '../src/lib/mapLimits.js';

test('cizim alani esdeger daire yaricapina cevrilir', () => {
  // 25 km2 -> r = sqrt(25e6 / pi) ~ 2821m
  assert.equal(deriveRadiusFromArea(25 * 1000 * 1000), 2821);
});

test('kucuk cizimler eski davranis gibi 1000m tabanda kaliyor', () => {
  assert.equal(deriveRadiusFromArea(0.5 * 1000 * 1000), MIN_ANALYSIS_RADIUS_M);
});

test('yaricap GEE kotasi icin 5000m ile sinirlaniyor', () => {
  // 200 km2 cizilemiyor ama savunma amacli tavan yine de test ediliyor
  assert.equal(deriveRadiusFromArea(200 * 1000 * 1000), MAX_ANALYSIS_RADIUS_M);
});

test('gecersiz alan guvenli varsayilana dusuyor', () => {
  assert.equal(deriveRadiusFromArea(NaN), MIN_ANALYSIS_RADIUS_M);
  assert.equal(deriveRadiusFromArea(-5), MIN_ANALYSIS_RADIUS_M);
});
