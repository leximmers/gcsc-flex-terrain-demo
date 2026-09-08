'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ASSETS,
  SCENARIOS,
  computeNetImport,
  getStatus,
  getScenario,
  applyEvent,
  INITIAL_UI_STATE,
} = require('./logic.js');

const CHARGER_STATES = new Set(['actief', 'gepauzeerd', 'later']);
const BATTERY_STATES = new Set(['idle', 'laden', 'levert-vermogen']);
const HEATPUMP_STATES = new Set(['uit', 'normaal', 'vooraf-opwarmen', 'doorgeschoven']);

const SCENARIO_IDS = ['zonpiek', 'avondpiek', 'netcongestie'];

// T1 — netImport arithmetic matches §3 for all 6 states.
test('T1 netImport arithmetic matches the authored data table', () => {
  assert.equal(computeNetImport(SCENARIOS.zonpiek.baseline), -105);
  assert.equal(computeNetImport(SCENARIOS.zonpiek.optimized), 30);
  assert.equal(computeNetImport(SCENARIOS.avondpiek.baseline), 145);
  assert.equal(computeNetImport(SCENARIOS.avondpiek.optimized), 55);
  assert.equal(computeNetImport(SCENARIOS.netcongestie.baseline), 125);
  assert.equal(computeNetImport(SCENARIOS.netcongestie.optimized), 22);
});

// T2 — optimized state never breaches its own limit (rule 3).
test('T2 optimized state never breaches its own import limit', () => {
  for (const id of SCENARIO_IDS) {
    const scenario = SCENARIOS[id];
    assert.ok(
      computeNetImport(scenario.optimized) <= scenario.optimized.importLimit,
      `${id}: optimized netImport must be <= importLimit`
    );
  }
});

// T3 — netcongestie baseline is the one deliberate breach (rule 4).
test('T3 only netcongestie baseline is above limit', () => {
  assert.equal(
    getStatus(
      computeNetImport(SCENARIOS.netcongestie.baseline),
      SCENARIOS.netcongestie.baseline.importLimit
    ),
    'boven-limiet'
  );
  assert.equal(
    getStatus(
      computeNetImport(SCENARIOS.zonpiek.baseline),
      SCENARIOS.zonpiek.baseline.importLimit
    ),
    'binnen-limiet'
  );
  assert.equal(
    getStatus(
      computeNetImport(SCENARIOS.avondpiek.baseline),
      SCENARIOS.avondpiek.baseline.importLimit
    ),
    'binnen-limiet'
  );
});

// T4 — essential load is untouched (rule 1).
test('T4 essential building load is never a control variable', () => {
  for (const id of SCENARIO_IDS) {
    const scenario = SCENARIOS[id];
    assert.equal(scenario.baseline.buildingLoad, scenario.optimized.buildingLoad);
    assert.equal(
      scenario.optimized.actions.at(-1),
      'Gebouwlast: geen aanpassing (essentieel)'
    );
  }
});

// T5 — Zonpiek optimize increases on-site consumption, not just import.
test('T5 zonpiek optimize absorbs surplus instead of exporting it', () => {
  const { baseline, optimized } = SCENARIOS.zonpiek;
  const onSiteDemand = (state) =>
    state.buildingLoad + state.heatpump.power + state.chargers.reduce((sum, c) => sum + c.power, 0);

  assert.equal(onSiteDemand(baseline), 35);
  assert.equal(onSiteDemand(optimized), 110);
  assert.ok(onSiteDemand(optimized) > onSiteDemand(baseline));

  assert.ok(computeNetImport(baseline) < 0);
  assert.ok(computeNetImport(optimized) >= 0);
});

// T6 — Avondpiek/Netcongestie optimize strictly reduces import (peak-shaving story).
test('T6 avondpiek and netcongestie optimize strictly reduces import', () => {
  assert.ok(
    computeNetImport(SCENARIOS.avondpiek.optimized) < computeNetImport(SCENARIOS.avondpiek.baseline)
  );
  assert.ok(
    computeNetImport(SCENARIOS.netcongestie.optimized) <
      computeNetImport(SCENARIOS.netcongestie.baseline)
  );
});

// T7 — charger/battery/heatpump state labels are drawn from a closed enum.
test('T7 state labels are drawn from closed enums', () => {
  for (const id of SCENARIO_IDS) {
    for (const mode of ['baseline', 'optimized']) {
      const state = SCENARIOS[id][mode];
      for (const charger of state.chargers) {
        assert.ok(CHARGER_STATES.has(charger.state), `${id}.${mode} charger ${charger.id} state`);
      }
      assert.ok(BATTERY_STATES.has(state.battery.state), `${id}.${mode} battery state`);
      assert.ok(HEATPUMP_STATES.has(state.heatpump.state), `${id}.${mode} heatpump state`);
    }
  }
});

// T8 — state/power consistency.
test('T8 authored state/power values are internally consistent', () => {
  for (const id of SCENARIO_IDS) {
    for (const mode of ['baseline', 'optimized']) {
      const state = SCENARIOS[id][mode];

      if (state.battery.state === 'idle') {
        assert.equal(state.battery.power, 0);
      }
      if (state.battery.power > 0) {
        assert.equal(state.battery.state, 'laden');
      }
      if (state.battery.power < 0) {
        assert.equal(state.battery.state, 'levert-vermogen');
      }

      for (const charger of state.chargers) {
        if (charger.state === 'actief') {
          assert.ok(charger.power > 0, `${id}.${mode} charger ${charger.id} actief implies power > 0`);
        }
        if (charger.power > 0) {
          assert.equal(charger.state, 'actief', `${id}.${mode} charger ${charger.id} power > 0 implies actief`);
        }
      }
    }
  }
});

// T9 — the `gepauzeerd` vs `later` distinction survives, per §1.2.
test('T9 gepauzeerd vs later distinction survives at 0 kW', () => {
  assert.equal(SCENARIOS.zonpiek.baseline.chargers[2].state, 'later');
  assert.equal(SCENARIOS.zonpiek.baseline.chargers[2].power, 0);

  assert.equal(SCENARIOS.netcongestie.optimized.chargers[2].state, 'gepauzeerd');
  assert.equal(SCENARIOS.netcongestie.optimized.chargers[2].power, 0);
});

// T10 — determinism / no hidden time or randomness.
test('T10 computeNetImport and getStatus are deterministic', () => {
  const state = SCENARIOS.avondpiek.optimized;
  const first = computeNetImport(state);
  const second = computeNetImport(state);
  assert.equal(first, second);

  const statusA = getStatus(first, state.importLimit);
  const statusB = getStatus(second, state.importLimit);
  assert.equal(statusA, statusB);
});

// T11 — `getScenario` contract.
test('T11 getScenario returns the scenario or throws RangeError', () => {
  const scenario = getScenario('zonpiek');
  assert.equal(scenario.id, 'zonpiek');
  assert.throws(() => getScenario('does-not-exist'), RangeError);
});

// T12 — UI-state reducer. Optimize is a two-step request/resolve with a
// token so a stale, in-flight resolve can be told apart from a fresh one
// (see T14/T15 — this is what makes the 700ms UI timer race-proof).
test('T12 applyEvent reducer covers SELECT_SCENARIO / OPTIMIZE request-resolve / RESET', () => {
  assert.deepEqual(
    applyEvent({ scenarioId: 'zonpiek', mode: 'optimized', pendingToken: null }, { type: 'SELECT_SCENARIO', id: 'netcongestie' }),
    { scenarioId: 'netcongestie', mode: 'baseline', pendingToken: null }
  );
  assert.deepEqual(
    applyEvent({ scenarioId: 'avondpiek', mode: 'baseline', pendingToken: null }, { type: 'OPTIMIZE_REQUEST', token: 1 }),
    { scenarioId: 'avondpiek', mode: 'optimizing', pendingToken: 1 }
  );
  assert.deepEqual(
    applyEvent({ scenarioId: 'avondpiek', mode: 'optimizing', pendingToken: 1 }, { type: 'OPTIMIZE_RESOLVE', token: 1 }),
    { scenarioId: 'avondpiek', mode: 'optimized', pendingToken: null }
  );
  assert.deepEqual(
    applyEvent({ scenarioId: 'avondpiek', mode: 'optimized', pendingToken: null }, { type: 'RESET' }),
    { scenarioId: 'avondpiek', mode: 'baseline', pendingToken: null }
  );
});

// T14 — reviewer-found race: a scenario switch during the pending 700ms
// optimize timer must not let the stale timer's resolve apply.
test('T14 stale OPTIMIZE_RESOLVE is a no-op after a scenario switch (race condition)', () => {
  let uiState = applyEvent(INITIAL_UI_STATE, { type: 'SELECT_SCENARIO', id: 'zonpiek' });
  uiState = applyEvent(uiState, { type: 'OPTIMIZE_REQUEST', token: 1 });
  assert.equal(uiState.mode, 'optimizing');

  // user switches scenario while the optimize timer is still pending
  uiState = applyEvent(uiState, { type: 'SELECT_SCENARIO', id: 'avondpiek' });
  assert.deepEqual(uiState, { scenarioId: 'avondpiek', mode: 'baseline', pendingToken: null });

  // the stale timer now fires and dispatches its resolve against current uiState
  const resolved = applyEvent(uiState, { type: 'OPTIMIZE_RESOLVE', token: 1 });

  assert.deepEqual(resolved, uiState, 'stale optimize resolve must be a no-op after scenario switch');
  assert.equal(resolved.mode, 'baseline');
  assert.equal(resolved.scenarioId, 'avondpiek');
});

// T15 — same race, but via RESET instead of a scenario switch.
test('T15 stale OPTIMIZE_RESOLVE is a no-op after a reset (race condition)', () => {
  let uiState = { scenarioId: 'avondpiek', mode: 'optimizing', pendingToken: 1 };
  uiState = applyEvent(uiState, { type: 'RESET' });
  assert.deepEqual(uiState, { scenarioId: 'avondpiek', mode: 'baseline', pendingToken: null });

  const resolved = applyEvent(uiState, { type: 'OPTIMIZE_RESOLVE', token: 1 });
  assert.deepEqual(resolved, uiState, 'stale optimize resolve must be a no-op after reset');
});

// T13 — scenario data is immutable across repeated reads (no shared-mutable-state bug).
test('T13 scenario data is not mutated by reducer or repeated reads', () => {
  const before = getScenario('zonpiek').optimized.battery.power;

  applyEvent({ scenarioId: 'zonpiek', mode: 'baseline' }, { type: 'OPTIMIZE' });
  applyEvent({ scenarioId: 'zonpiek', mode: 'optimized' }, { type: 'RESET' });

  const after = getScenario('zonpiek').optimized.battery.power;
  assert.equal(before, after);
  assert.equal(SCENARIOS.zonpiek.optimized.battery.power, before);
});

test('ASSETS constants exposed as documented', () => {
  assert.equal(ASSETS.PV_MAX, 150);
  assert.equal(ASSETS.BATTERY_MAX_CHARGE, 60);
  assert.equal(ASSETS.BATTERY_MAX_DISCHARGE, 60);
  assert.equal(ASSETS.BATTERY_CAPACITY, 200);
  assert.equal(ASSETS.CHARGER_MAX, 25);
  assert.equal(ASSETS.HEATPUMP_MAX, 30);
  assert.equal(ASSETS.GRID_STANDARD_LIMIT, 150);
});
