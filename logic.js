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

// ===================== Build-your-own-terrain: generalized engine =====================
// See BUILD_YOUR_TERRAIN_TECH.md §1-4 for the data-shape contract these implement.

var ASSET_DEFS = {
  pv: { key: 'pv', group: 'elektrisch', max: 1, connector: 'solid', requires: [] },
  battery: { key: 'battery', group: 'elektrisch', max: 1, connector: 'solid', requires: [] },
  charger: { key: 'chargers', group: 'elektrisch', max: 3, connector: 'solid', requires: [] },
  heatpump: { key: 'heatpump', group: 'thermisch', max: 1, connector: 'dashed', requires: [] },
  thermalBuffer: { key: 'thermalBuffer', group: 'thermisch', max: 1, connector: 'dashed', requires: ['heatpump'] },
};

var TOTAL_PLACEABLE_SLOTS = Object.keys(ASSET_DEFS).reduce(function (sum, k) {
  return sum + ASSET_DEFS[k].max;
}, 0);

function makeStarterPlacedAssets() {
  return { pv: true, battery: false, chargers: [true, false, false], heatpump: false, thermalBuffer: false };
}

var STARTER_TERRAIN = makeStarterPlacedAssets();

var INITIAL_BUILD_STATE = {
  step: 'build',
  placedAssets: STARTER_TERRAIN,
  scenarioId: 'zonpiek',
  mode: 'baseline',
  pendingToken: null,
};

var BUFFER_LINE = {
  zonpiek: 'Warmtebuffer slaat overtollige warmte op voor de avond',
  avondpiek: 'Warmtebuffer levert warmte terug, warmtepomp blijft uit',
  netcongestie: 'Warmtebuffer levert warmte terug, warmtepomp blijft uit',
};

function computeEffectiveHeatpump(sourceHeatpump, placedAssets) {
  if (!placedAssets.heatpump) return { power: 0, state: 'uit' };
  return sourceHeatpump;
}

function getGapCallout(scenarioId, placedAssets) {
  var hasBattery = placedAssets.battery;
  var hasCharger = placedAssets.chargers.some(function (c) { return c; });
  var hasHeatpump = placedAssets.heatpump;
  var hasAnyFlex = hasBattery || hasCharger || hasHeatpump;

  if (scenarioId === 'zonpiek' && !hasBattery) {
    return 'Dit terrein heeft geen batterij. Het zonne-overschot wordt teruggeleverd aan het net in plaats van lokaal gebruikt.';
  }
  if (scenarioId === 'avondpiek' && !hasCharger) {
    return 'Dit terrein heeft geen laadpalen geplaatst. De avondpiek komt vooral van de gebouwlast.';
  }
  if (scenarioId === 'netcongestie' && !hasAnyFlex) {
    return 'Dit terrein heeft geen batterij, laadpalen of warmtepomp. Zonder flexibele bronnen kan de besturingslaag de import niet verlagen — voeg een asset toe en probeer het opnieuw.';
  }
  return null;
}

function getActionsForPlacedAssets(scenarioId, mode, placedAssets) {
  if (mode === 'baseline') return [];

  var source = getScenario(scenarioId).optimized.actions;
  var lines = [];

  var gap = getGapCallout(scenarioId, placedAssets);
  if (gap) lines.push(gap);

  if (placedAssets.battery) lines.push(source[0]);
  for (var i = 0; i < 3; i++) {
    if (placedAssets.chargers[i]) lines.push(source[1 + i]);
  }
  if (placedAssets.heatpump) {
    lines.push(source[4]);
    if (placedAssets.thermalBuffer) lines.push(BUFFER_LINE[scenarioId]);
  }
  lines.push('Gebouwlast: geen aanpassing (essentieel)');
  return lines;
}

function hasAnyOptimizableAsset(placedAssets) {
  return !!(placedAssets.battery || placedAssets.chargers.some(function (c) { return c; }) || placedAssets.heatpump);
}

function countPlacedAssets(placedAssets) {
  return (placedAssets.pv ? 1 : 0)
    + (placedAssets.battery ? 1 : 0)
    + placedAssets.chargers.filter(function (c) { return c; }).length
    + (placedAssets.heatpump ? 1 : 0)
    + (placedAssets.thermalBuffer ? 1 : 0);
}

function getEffectiveState(scenarioId, mode, placedAssets) {
  var source = getScenario(scenarioId)[mode];
  return {
    buildingLoad: source.buildingLoad,
    pv: placedAssets.pv ? source.pv : 0,
    importLimit: source.importLimit,
    battery: placedAssets.battery ? source.battery : { power: 0, state: 'idle' },
    chargers: source.chargers.map(function (c, i) {
      return placedAssets.chargers[i] ? c : { id: c.id, power: 0, state: 'later' };
    }),
    heatpump: computeEffectiveHeatpump(source.heatpump, placedAssets),
    actions: getActionsForPlacedAssets(scenarioId, mode, placedAssets),
  };
}

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
      return Object.assign({}, uiState, { scenarioId: event.id, mode: 'baseline', pendingToken: null });
    case 'OPTIMIZE_REQUEST':
      if (uiState.mode !== 'baseline') return uiState;
      return Object.assign({}, uiState, { mode: 'optimizing', pendingToken: event.token });
    case 'OPTIMIZE_RESOLVE':
      if (uiState.mode !== 'optimizing' || uiState.pendingToken !== event.token) return uiState;
      return Object.assign({}, uiState, { mode: 'optimized', pendingToken: null });
    case 'RESET':
      return Object.assign({}, uiState, { mode: 'baseline', pendingToken: null });
    case 'PLACE_ASSET': {
      var placedAssets = uiState.placedAssets;
      if (event.key === 'charger') {
        var idx = placedAssets.chargers.indexOf(false);
        if (idx === -1) return uiState;
        var newChargers = placedAssets.chargers.slice();
        newChargers[idx] = true;
        return Object.assign({}, uiState, {
          placedAssets: Object.assign({}, placedAssets, { chargers: newChargers }),
          mode: 'baseline',
          pendingToken: null,
        });
      }
      if (placedAssets[event.key] === true) return uiState;
      return Object.assign({}, uiState, {
        placedAssets: Object.assign({}, placedAssets, singleKeyObject(event.key, true)),
        mode: 'baseline',
        pendingToken: null,
      });
    }
    case 'REMOVE_ASSET': {
      var pa = uiState.placedAssets;
      if (event.key === 'charger') {
        var chargers2 = pa.chargers.slice();
        chargers2[event.index] = false;
        return Object.assign({}, uiState, {
          placedAssets: Object.assign({}, pa, { chargers: chargers2 }),
          mode: 'baseline',
          pendingToken: null,
        });
      }
      return Object.assign({}, uiState, {
        placedAssets: Object.assign({}, pa, singleKeyObject(event.key, false)),
        mode: 'baseline',
        pendingToken: null,
      });
    }
    case 'GOTO_STEP':
      return Object.assign({}, uiState, { step: event.step });
    case 'RESET_ALL':
      return {
        step: 'build',
        placedAssets: makeStarterPlacedAssets(),
        scenarioId: 'zonpiek',
        mode: 'baseline',
        pendingToken: null,
      };
    default:
      return uiState;
  }
}

function singleKeyObject(key, value) {
  var obj = {};
  obj[key] = value;
  return obj;
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
    ASSET_DEFS: ASSET_DEFS,
    STARTER_TERRAIN: STARTER_TERRAIN,
    INITIAL_BUILD_STATE: INITIAL_BUILD_STATE,
    TOTAL_PLACEABLE_SLOTS: TOTAL_PLACEABLE_SLOTS,
    getEffectiveState: getEffectiveState,
    getActionsForPlacedAssets: getActionsForPlacedAssets,
    getGapCallout: getGapCallout,
    hasAnyOptimizableAsset: hasAnyOptimizableAsset,
    countPlacedAssets: countPlacedAssets,
  };
}
