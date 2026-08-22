const test = require('node:test');
const assert = require('node:assert/strict');

const { extractCoordinates, shouldAlert } = require('../index');

test('extractCoordinates uses the resolved lat/lon written by the AI engine', () => {
  const coords = extractCoordinates({ lat: 36.853, lon: 28.2715, start_points: [] });

  assert.deepEqual(coords, { lat: 36.853, lon: 28.2715 });
});

test('extractCoordinates falls back to start_points for older tasks', () => {
  const coords = extractCoordinates({ start_points: [{ lat: 40.1885, lng: 29.061 }] });

  assert.deepEqual(coords, { lat: 40.1885, lon: 29.061 });
});

test('extractCoordinates accepts latitude/longitude naming', () => {
  const coords = extractCoordinates({ start_points: [{ latitude: 39, longitude: 35 }] });

  assert.deepEqual(coords, { lat: 39, lon: 35 });
});

test('extractCoordinates returns null when no usable point exists', () => {
  assert.equal(extractCoordinates({}), null);
  assert.equal(extractCoordinates({ start_points: [{ foo: 1 }] }), null);
});

test('shouldAlert triggers on high fire risk', () => {
  assert.equal(shouldAlert({ fire_risk: 'yuksek' }), true);
  assert.equal(shouldAlert({ fire_risk: 'orta' }), false);
});

test('shouldAlert triggers on critical vegetation loss', () => {
  const result = {
    fire_risk: 'dusuk',
    ai_results: { change_detection: { deforestation: { severity: 'CRITICAL' } } }
  };

  assert.equal(shouldAlert(result), true);
});

test('shouldAlert stays quiet for a normal result', () => {
  const result = {
    fire_risk: 'yok',
    pollution_level: 'yok',
    ai_results: { change_detection: { deforestation: { severity: 'LOW' } } }
  };

  assert.equal(shouldAlert(result), false);
});
