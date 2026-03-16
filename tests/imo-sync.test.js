const test = require('node:test');
const assert = require('node:assert/strict');

const { __test__ } = require('../public/js/script.js');

const {
  STORAGE_KEYS,
  getGlobalImoTransportState,
  resolveLightDuesTypeForImo,
  resolvePortDuesCargoTypeForImo,
  setGlobalImoTransportState,
  shouldApplyGlobalImoStateOnInit
} = __test__;

function createLocalStorage(initialEntries = {}) {
  const store = new Map(Object.entries(initialEntries));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

function readStoredJson(key) {
  const raw = global.localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

test.beforeEach(() => {
  global.localStorage = createLocalStorage();
});

test.after(() => {
  delete global.localStorage;
});

test('Port Dues cargo type is preserved when global IMO is off', () => {
  global.localStorage.setItem(STORAGE_KEYS.portDuesState, JSON.stringify({ cargoType: 'scrapIron' }));
  global.localStorage.setItem(STORAGE_KEYS.portDuesStateSailing, JSON.stringify({ cargoType: 'grains' }));

  setGlobalImoTransportState(false);

  assert.equal(getGlobalImoTransportState(), false);
  assert.equal(readStoredJson(STORAGE_KEYS.portDuesState).cargoType, 'scrapIron');
  assert.equal(readStoredJson(STORAGE_KEYS.portDuesStateSailing).cargoType, 'grains');
});

test('Global IMO forces liquid cargo and tanker selections when enabled', () => {
  global.localStorage.setItem(STORAGE_KEYS.portDuesState, JSON.stringify({ cargoType: 'scrapIron' }));
  global.localStorage.setItem(STORAGE_KEYS.lightDuesState, JSON.stringify({ type: 'container' }));

  setGlobalImoTransportState(true);

  assert.equal(getGlobalImoTransportState(), true);
  assert.equal(readStoredJson(STORAGE_KEYS.portDuesState).cargoType, 'liquidCargo');
  assert.equal(readStoredJson(STORAGE_KEYS.lightDuesState).type, 'tanker');
});

test('Forced IMO defaults reset back to normal defaults when global IMO is disabled', () => {
  global.localStorage.setItem(STORAGE_KEYS.portDuesState, JSON.stringify({ cargoType: 'liquidCargo' }));
  global.localStorage.setItem(STORAGE_KEYS.lightDuesState, JSON.stringify({ type: 'tanker' }));

  setGlobalImoTransportState(false);

  assert.equal(readStoredJson(STORAGE_KEYS.portDuesState).cargoType, 'bulkCargo');
  assert.equal(readStoredJson(STORAGE_KEYS.lightDuesState).type, 'cargo');
});

test('Pure IMO helpers preserve custom selections unless a forced reset is needed', () => {
  assert.equal(resolvePortDuesCargoTypeForImo('scrapIron', false), 'scrapIron');
  assert.equal(resolvePortDuesCargoTypeForImo('scrapIron', true), 'liquidCargo');
  assert.equal(resolvePortDuesCargoTypeForImo('liquidCargo', false, { resetForced: true }), 'bulkCargo');

  assert.equal(resolveLightDuesTypeForImo('container', false), 'container');
  assert.equal(resolveLightDuesTypeForImo('container', true), 'tanker');
  assert.equal(resolveLightDuesTypeForImo('tanker', false, { resetForced: true }), 'cargo');
});

test('Initial global IMO application only runs when needed', () => {
  assert.equal(shouldApplyGlobalImoStateOnInit(null, false), false);
  assert.equal(shouldApplyGlobalImoStateOnInit(null, true), true);
  assert.equal(shouldApplyGlobalImoStateOnInit(false, true), false);
  assert.equal(shouldApplyGlobalImoStateOnInit(true, false), true);
});
