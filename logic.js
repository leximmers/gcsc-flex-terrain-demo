'use strict';

// Pure control-logic module for the GCSC Flex Terrain demo.
// No DOM, no randomness, no wall-clock dependence — see LOGIC_PLAN.md.

var ASSETS = {
  PV_MAX: 150,
  BATTERY_MAX_CHARGE: 60,
  BATTERY_MAX_DISCHARGE: 60,
  BATTERY_CAPACITY: 200,
  CHARGER_MAX: 25,
  HEATPUMP_MAX: 30,
  GRID_STANDARD_LIMIT: 150,
};

var SCENARIOS = {
  zonpiek: {
    id: 'zonpiek',
    label: 'Zonpiek',
    subtitle: 'Veel zon, weinig verbruik',
    baseline: {
      buildingLoad: 35,
      pv: 140,
      importLimit: 150,
      battery: { power: 0, state: 'idle' },
      chargers: [
        { id: 1, power: 0, state: 'later' },
        { id: 2, power: 0, state: 'later' },
        { id: 3, power: 0, state: 'later' },
      ],
      heatpump: { power: 0, state: 'uit' },
      actions: [],
    },
    optimized: {
      buildingLoad: 35,
      pv: 140,
      importLimit: 150,
      battery: { power: 60, state: 'laden' },
      chargers: [
        { id: 1, power: 25, state: 'actief' },
        { id: 2, power: 25, state: 'actief' },
        { id: 3, power: 0, state: 'later' },
      ],
      heatpump: { power: 25, state: 'vooraf-opwarmen' },
      actions: [
        'Batterij laadt 60 kW op zonne-overschot',
        'Laadpaal 1 actief, 25 kW op zonne-overschot',
        'Laadpaal 2 actief, 25 kW op zonne-overschot',
        'Laadpaal 3: later',
        'Warmtepomp vooraf opgewarmd, 25 kW',
        'Gebouwlast: geen aanpassing (essentieel)',
      ],
    },
  },

  avondpiek: {
    id: 'avondpiek',
    label: 'Avondpiek',
    subtitle: 'Laden na werktijd, verbruik loopt op',
    baseline: {
      buildingLoad: 45,
      pv: 5,
      importLimit: 150,
      battery: { power: 0, state: 'idle' },
      chargers: [
        { id: 1, power: 25, state: 'actief' },
        { id: 2, power: 25, state: 'actief' },
        { id: 3, power: 25, state: 'actief' },
      ],
      heatpump: { power: 30, state: 'normaal' },
      actions: [],
    },
    optimized: {
      buildingLoad: 45,
      pv: 5,
      importLimit: 150,
      battery: { power: -40, state: 'levert-vermogen' },
      chargers: [
        { id: 1, power: 25, state: 'actief' },
        { id: 2, power: 0, state: 'later' },
        { id: 3, power: 0, state: 'later' },
      ],
      heatpump: { power: 30, state: 'normaal' },
      actions: [
        'Batterij levert 40 kW om de piek af te vlakken',
        'Laadpaal 1 actief, 25 kW',
        'Laadpaal 2: later (na laadpaal 1)',
        'Laadpaal 3: later (na laadpaal 1 en 2)',
        'Warmtepomp: geen aanpassing nodig, 30 kW',
        'Gebouwlast: geen aanpassing (essentieel)',
      ],
    },
  },

  netcongestie: {
    id: 'netcongestie',
    label: 'Netcongestie',
    subtitle: 'Netbeheerder vraagt om minder import',
    baseline: {
      buildingLoad: 40,
      pv: 20,
      importLimit: 100,
      battery: { power: 0, state: 'idle' },
      chargers: [
        { id: 1, power: 25, state: 'actief' },
        { id: 2, power: 25, state: 'actief' },
        { id: 3, power: 25, state: 'actief' },
      ],
      heatpump: { power: 30, state: 'normaal' },
      actions: [],
    },
    optimized: {
      buildingLoad: 40,
      pv: 20,
      importLimit: 100,
      battery: { power: -20, state: 'levert-vermogen' },
      chargers: [
        { id: 1, power: 11, state: 'actief' },
        { id: 2, power: 11, state: 'actief' },
        { id: 3, power: 0, state: 'gepauzeerd' },
      ],
      heatpump: { power: 0, state: 'doorgeschoven' },
      actions: [
        'Batterij levert 20 kW binnen ingestelde grenzen',
        'Laadpaal 1 afgeschaald naar 11 kW',
        'Laadpaal 2 afgeschaald naar 11 kW',
        'Laadpaal 3 gepauzeerd',
        'Warmtevraag doorgeschoven binnen ingestelde grenzen',
        'Gebouwlast: geen aanpassing (essentieel)',
      ],
    },
  },
};

function computeNetImport(state) {
  var chargerSum = state.chargers.reduce(function (sum, c) {
    return sum + c.power;
  }, 0);
  return state.buildingLoad + state.heatpump.power + chargerSum + state.battery.power - state.pv;
}

function getStatus(netImport, importLimit) {
  return netImport > importLimit ? 'boven-limiet' : 'binnen-limiet';
}

function getScenario(id) {
  var scenario = SCENARIOS[id];
  if (!scenario) {
    throw new RangeError('Unknown scenario id: ' + id);
  }
  return scenario;
}

// OPTIMIZE is a two-step request/resolve so a UI timer (see index.html) can
// dispatch its resolve after a delay without risk of applying against a
// scenario/mode the user has since navigated away from: OPTIMIZE_RESOLVE
// only takes effect while still 'optimizing' with a matching pendingToken;
// any SELECT_SCENARIO or RESET in between clears pendingToken and makes a
// later resolve for the old token a no-op.
function applyEvent(uiState, event) {
  switch (event.type) {
    case 'SELECT_SCENARIO':
      return { scenarioId: event.id, mode: 'baseline', pendingToken: null };
    case 'OPTIMIZE_REQUEST':
      if (uiState.mode !== 'baseline') return uiState;
      return Object.assign({}, uiState, { mode: 'optimizing', pendingToken: event.token });
    case 'OPTIMIZE_RESOLVE':
      if (uiState.mode !== 'optimizing' || uiState.pendingToken !== event.token) return uiState;
      return Object.assign({}, uiState, { mode: 'optimized', pendingToken: null });
    case 'RESET':
      return Object.assign({}, uiState, { mode: 'baseline', pendingToken: null });
    default:
      return uiState;
  }
}

var INITIAL_UI_STATE = { scenarioId: 'zonpiek', mode: 'baseline', pendingToken: null };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ASSETS: ASSETS,
    SCENARIOS: SCENARIOS,
    computeNetImport: computeNetImport,
    getStatus: getStatus,
    getScenario: getScenario,
    applyEvent: applyEvent,
    INITIAL_UI_STATE: INITIAL_UI_STATE,
  };
}
