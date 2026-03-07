(() => {
  const FORM_PAGE = 'pda-split.html';
  const DASHBOARD_PAGE = 'index.html';
  const API_POSITIONS_ENDPOINT = '/api/positions';
  const API_FALLBACK_STATUS_MESSAGE = 'Server unavailable. Using local browser database (this device only).';
  const API_FALLBACK_BANNER_MESSAGE = 'Offline mode: server unavailable. Data is currently saved in this browser only.';

  const DB_STORAGE = {
    positions: 'pda_positions_database_v1',
    selected: 'pda_selected_position_id',
    indexState: 'pda_index_state',
    vesselName: 'pda_vessel_name',
    gt: 'pda_gt',
    quantity: 'pda_quantity',
    sortMode: 'pda_positions_sort_mode',
    searchQuery: 'pda_positions_search_query'
  };

  const NEW_DRAFT_RESET_KEYS = [
    'pda_towage_total',
    'pda_towage_arrival_count',
    'pda_towage_departure_count',
    'pda_tugs_state',
    'pda_towage_total_sailing',
    'pda_towage_arrival_count_sailing',
    'pda_towage_departure_count_sailing',
    'pda_tugs_state_sailing',
    'pda_light_dues_state',
    'pda_light_dues_state_sailing',
    'pda_light_dues_amount_pda',
    'pda_light_dues_tariff_pda',
    'pda_light_dues_amount_sailing',
    'pda_light_dues_tariff_sailing',
    'pda_port_dues_state',
    'pda_port_dues_state_sailing',
    'pda_port_dues_amount_pda',
    'pda_port_dues_amount_sailing',
    'pda_port_dues_cargo_amount_pda',
    'pda_port_dues_cargo_amount_sailing',
    'pda_port_dues_bunkering_amount_pda',
    'pda_port_dues_bunkering_amount_sailing',
    'pda_mooring_state',
    'pda_mooring_state_sailing',
    'pda_mooring_amount_pda',
    'pda_mooring_amount_sailing',
    'pda_pilotage_state',
    'pda_pilotage_state_sailing',
    'pda_pilotage_amount_pda',
    'pda_pilotage_amount_sailing',
    'pda_pilot_boat_state',
    'pda_pilot_boat_state_sailing',
    'pda_pilot_boat_amount_pda',
    'pda_pilot_boat_amount_sailing',
    'pda_global_imo_transport'
  ];

  let tableBody = null;
  let statusNode = null;
  let apiFallbackNotified = false;
  let fallbackBannerNode = null;
  let activePositionRecord = null;
  let sortModeSelect = null;
  let sortModeToggle = null;
  let sortModeButtons = [];
  let searchInput = null;
  let dashboardIconAnimationBound = false;
  let autosaveTimer = null;
  let autosaveInFlight = false;
  let autosaveQueued = false;
  let lastSavedRecordSignature = '';
  let autosaveListenersBound = false;
  const DASHBOARD_ICON_ANIMATION_CLASS = 'icon-animating';
  const DASHBOARD_ICON_ANIMATION_MS = 176;
  const dashboardIconAnimationTimers = new WeakMap();

  const SORT_MODES = {
    created: 'created',
    edited: 'edited'
  };
  const CALCULATOR_PAGE_NAMES = new Set([
    'light-dues-pda.html',
    'light-dues-sailing-pda.html',
    'port-dues-pda.html',
    'port-dues-sailing-pda.html',
    'pilot-pda.html',
    'pilot-sailing-pda.html',
    'pilot-boat-pda.html',
    'pilot-boat-sailing-pda.html',
    'mooring-pda.html',
    'mooring-sailing-pda.html',
    'tugs-pda.html',
    'tugs-sailing-pda.html'
  ]);

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (error) {
      // ignore storage failures
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      // ignore storage failures
    }
  }

  function readJson(raw, fallback) {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function toIsoOrEmpty(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
  }

  function getIdTimestamp(id) {
    const match = String(id || '').match(/^pda_(\d{10,})_/);
    if (!match) return null;
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  }

  function getCreatedSortTime(record) {
    const createdAtTime = new Date(record.createdAt).getTime();
    if (Number.isFinite(createdAtTime)) return createdAtTime;
    const idTimestamp = getIdTimestamp(record.id);
    if (Number.isFinite(idTimestamp)) return idTimestamp;
    const savedAtTime = new Date(record.savedAt).getTime();
    return Number.isFinite(savedAtTime) ? savedAtTime : 0;
  }

  function getEditedSortTime(record) {
    const savedAtTime = new Date(record.savedAt).getTime();
    if (Number.isFinite(savedAtTime)) return savedAtTime;
    return getCreatedSortTime(record);
  }

  function normalizeSortMode(mode) {
    return mode === SORT_MODES.edited ? SORT_MODES.edited : SORT_MODES.created;
  }

  function getSortModePreference() {
    if (sortModeToggle) {
      const activeButton = sortModeToggle.querySelector('.pda-db-sort-btn.active[data-sort-mode], .pda-db-sort-btn[aria-pressed="true"][data-sort-mode]');
      const mode = sortModeToggle.dataset.value || (activeButton ? activeButton.dataset.sortMode : '');
      return normalizeSortMode(mode);
    }
    const mode = sortModeSelect ? sortModeSelect.value : storageGet(DB_STORAGE.sortMode);
    return normalizeSortMode(mode);
  }

  function setSortModePreference(mode) {
    const normalizedMode = normalizeSortMode(mode);
    storageSet(DB_STORAGE.sortMode, normalizedMode);
    if (sortModeSelect && sortModeSelect.value !== normalizedMode) {
      sortModeSelect.value = normalizedMode;
    }
    if (sortModeToggle) {
      sortModeToggle.dataset.value = normalizedMode;
      sortModeButtons.forEach((button) => {
        const isActive = normalizeSortMode(button.dataset.sortMode) === normalizedMode;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }
    return normalizedMode;
  }

  function sortPositionsForDisplay(positions, mode) {
    const sortMode = normalizeSortMode(mode);
    const next = Array.isArray(positions) ? positions.slice() : [];
    next.sort((a, b) => {
      if (sortMode === SORT_MODES.edited) {
        return getEditedSortTime(b) - getEditedSortTime(a);
      }
      return getCreatedSortTime(b) - getCreatedSortTime(a);
    });
    return next;
  }

  function normalizeSearchText(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeCalculatorState(rawState) {
    if (!rawState || typeof rawState !== 'object') return null;
    const normalized = {};
    NEW_DRAFT_RESET_KEYS.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(rawState, key)) return;
      const value = rawState[key];
      if (value === null || value === undefined) return;
      normalized[key] = String(value);
    });
    return Object.keys(normalized).length ? normalized : null;
  }

  function clonePlainObject(value) {
    if (!value || typeof value !== 'object') return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return null;
    }
  }

  function getSearchQuery() {
    const source = searchInput ? searchInput.value : '';
    return normalizeSearchText(source);
  }

  function setSearchQuery(query) {
    const sanitized = String(query == null ? '' : query)
      .replace(/\s+/g, ' ')
      .trim();
    if (searchInput && searchInput.value !== sanitized) {
      searchInput.value = sanitized;
    }
    return sanitized;
  }

  function matchesSearchQuery(position, query) {
    if (!query) return true;
    const haystack = [
      position && position.vesselName,
      position && (position.berthTerminal || position.port),
      position && position.operation,
      position && position.cargo,
      position && position.agent
    ]
      .map(normalizeSearchText)
      .join(' ');

    if (!haystack) return false;
    const terms = query.split(' ').filter(Boolean);
    return terms.every((term) => haystack.includes(term));
  }

  function isDashboardAnimatedIconButton(button) {
    if (!button || !(button instanceof HTMLElement)) return false;
    return button.matches('button.pda-db-edit-btn, button.pda-db-delete-btn');
  }

  function triggerDashboardIconAnimation(button) {
    if (!button || !isDashboardAnimatedIconButton(button) || button.disabled) return;
    const existingTimer = dashboardIconAnimationTimers.get(button);
    if (existingTimer) window.clearTimeout(existingTimer);

    button.classList.remove(DASHBOARD_ICON_ANIMATION_CLASS);
    void button.offsetWidth;
    button.classList.add(DASHBOARD_ICON_ANIMATION_CLASS);

    const nextTimer = window.setTimeout(() => {
      button.classList.remove(DASHBOARD_ICON_ANIMATION_CLASS);
      dashboardIconAnimationTimers.delete(button);
    }, DASHBOARD_ICON_ANIMATION_MS);
    dashboardIconAnimationTimers.set(button, nextTimer);
  }

  function bindDashboardIconAnimations() {
    if (dashboardIconAnimationBound) return;
    dashboardIconAnimationBound = true;

    document.addEventListener('pointerdown', (event) => {
      if (!event.isTrusted || event.button !== 0) return;
      const target = event.target;
      const button = target && target.closest ? target.closest('button') : null;
      if (!button) return;
      triggerDashboardIconAnimation(button);
    }, true);

    document.addEventListener('keydown', (event) => {
      if (!event.isTrusted) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target;
      const button = target && target.closest ? target.closest('button') : null;
      if (!button) return;
      triggerDashboardIconAnimation(button);
    }, true);
  }

  function normalizePositions(positions) {
    if (!Array.isArray(positions)) return [];

    const normalized = positions
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const id = String(item.id || '').trim();
        if (!id) return null;
        const savedAt = toIsoOrEmpty(item.savedAt) || String(item.savedAt || '').trim();
        let createdAt = toIsoOrEmpty(item.createdAt) || String(item.createdAt || '').trim();
        if (!createdAt) {
          const idTimestamp = getIdTimestamp(id);
          if (Number.isFinite(idTimestamp)) createdAt = new Date(idTimestamp).toISOString();
        }
        if (!createdAt) createdAt = savedAt;
        const quantitySource = item.quantity != null && String(item.quantity).trim() !== ''
          ? item.quantity
          : item.indexState && item.indexState.fields && item.indexState.fields.quantityInput;
        const calculatorState = normalizeCalculatorState(item.calculatorState);
        return {
          id,
          date: String(item.date || '').trim(),
          vesselName: String(item.vesselName || '').trim(),
          berthTerminal: String(item.berthTerminal || item.port || '').trim(),
          operation: String(item.operation || '').trim(),
          quantity: String(quantitySource == null ? '' : quantitySource).trim(),
          cargo: String(item.cargo || '').trim(),
          agent: String(item.agent || '').trim(),
          createdAt: String(createdAt || '').trim(),
          savedAt: String(savedAt || '').trim(),
          indexState: item.indexState && typeof item.indexState === 'object' ? item.indexState : null,
          calculatorState
        };
      })
      .filter(Boolean);

    normalized.sort((a, b) => {
      return getCreatedSortTime(b) - getCreatedSortTime(a);
    });

    return normalized;
  }

  function getPositionsLocal() {
    const parsed = readJson(storageGet(DB_STORAGE.positions), []);
    return normalizePositions(parsed);
  }

  function savePositionsLocal(positions) {
    storageSet(DB_STORAGE.positions, JSON.stringify(normalizePositions(positions)));
  }

  function canUseRemoteApi() {
    return window.location.protocol === 'http:' || window.location.protocol === 'https:';
  }

  async function requestJson(url, options = {}) {
    const requestOptions = {
      credentials: 'same-origin',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      }
    };

    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const payload = await response.json();
        if (payload && payload.error) message = String(payload.error);
      } catch (error) {
        // ignore parse failures
      }
      const requestError = new Error(message);
      requestError.status = response.status;
      throw requestError;
    }

    if (response.status === 204) return null;

    const text = await response.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function notifyApiFallbackOnce() {
    if (apiFallbackNotified) return;
    apiFallbackNotified = true;
    showApiFallbackBanner();
    setStatus(API_FALLBACK_STATUS_MESSAGE, true);
  }

  function ensureFallbackBannerNode() {
    if (fallbackBannerNode && fallbackBannerNode.isConnected) return fallbackBannerNode;
    const existing = document.getElementById('pdaApiFallbackBanner');
    if (existing) {
      fallbackBannerNode = existing;
      return fallbackBannerNode;
    }
    const container = document.querySelector('body.page-index .container') || document.body;
    if (!container) return null;
    const banner = document.createElement('div');
    banner.id = 'pdaApiFallbackBanner';
    banner.className = 'pda-db-fallback-banner';
    banner.setAttribute('role', 'alert');
    banner.hidden = true;
    banner.textContent = API_FALLBACK_BANNER_MESSAGE;
    container.insertBefore(banner, container.firstChild);
    fallbackBannerNode = banner;
    return fallbackBannerNode;
  }

  function showApiFallbackBanner() {
    const banner = ensureFallbackBannerNode();
    if (!banner) return;
    banner.hidden = false;
  }

  function hideApiFallbackBanner() {
    const banner = fallbackBannerNode || document.getElementById('pdaApiFallbackBanner');
    if (!banner) return;
    banner.hidden = true;
  }

  function clearApiFallbackNotice() {
    if (!apiFallbackNotified && !(fallbackBannerNode || document.getElementById('pdaApiFallbackBanner'))) return;
    apiFallbackNotified = false;
    hideApiFallbackBanner();
    if (statusNode && statusNode.textContent === API_FALLBACK_STATUS_MESSAGE) {
      setStatus('', false);
    }
  }

  async function getPositionsRemote() {
    const payload = await requestJson(API_POSITIONS_ENDPOINT);
    return normalizePositions(payload && payload.positions);
  }

  async function upsertPositionRemote(record) {
    await requestJson(API_POSITIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(record)
    });
  }

  async function deletePositionRemote(id) {
    await requestJson(`${API_POSITIONS_ENDPOINT}/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  }

  async function getPositions() {
    if (canUseRemoteApi()) {
      try {
        const remotePositions = await getPositionsRemote();
        clearApiFallbackNotice();
        return remotePositions;
      } catch (error) {
        notifyApiFallbackOnce();
      }
    }
    return getPositionsLocal();
  }

  function upsertPositionLocal(record) {
    const normalizedRecord = normalizePositions([record])[0];
    if (!normalizedRecord) return;

    const positions = getPositionsLocal();
    const existingIndex = positions.findIndex((item) => item.id === normalizedRecord.id);
    if (existingIndex >= 0) {
      const existing = positions[existingIndex];
      if (!normalizedRecord.createdAt) {
        normalizedRecord.createdAt = existing.createdAt || existing.savedAt || normalizedRecord.savedAt;
      }
      positions.splice(existingIndex, 1);
    }
    positions.unshift(normalizedRecord);
    savePositionsLocal(positions);
  }

  async function upsertPosition(record) {
    if (canUseRemoteApi()) {
      try {
        await upsertPositionRemote(record);
        clearApiFallbackNotice();
        return;
      } catch (error) {
        notifyApiFallbackOnce();
      }
    }
    upsertPositionLocal(record);
  }

  function deletePositionLocal(id) {
    const positions = getPositionsLocal();
    const nextPositions = positions.filter((item) => item.id !== id);
    if (nextPositions.length === positions.length) return false;
    savePositionsLocal(nextPositions);
    return true;
  }

  async function deletePosition(id) {
    if (canUseRemoteApi()) {
      try {
        await deletePositionRemote(id);
        clearApiFallbackNotice();
        return true;
      } catch (error) {
        notifyApiFallbackOnce();
      }
    }
    return deletePositionLocal(id);
  }

  function makeId() {
    return `pda_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function readField(id) {
    const field = document.getElementById(id);
    if (!field) return '';
    return String(field.value || '').trim();
  }

  function writeField(id, value) {
    const field = document.getElementById(id);
    if (!field) return;
    if (field.type === 'checkbox') {
      field.checked = Boolean(value);
      return;
    }
    field.value = value == null ? '' : String(value);
  }

  function formatSavedAt(savedAt) {
    if (!savedAt) return '-';
    const parsed = new Date(savedAt);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString();
  }

  function setStatus(message, isError) {
    if (!statusNode) return;
    statusNode.textContent = message || '';
    statusNode.classList.toggle('error', Boolean(isError));
  }

  function getUrl() {
    return new URL(window.location.href);
  }

  function getQueryValue(name) {
    return (getUrl().searchParams.get(name) || '').trim();
  }

  function isNewMode() {
    return getQueryValue('new') === '1';
  }

  function getCurrentPositionId() {
    const queryId = getQueryValue('pda');
    if (queryId) return queryId;
    return (storageGet(DB_STORAGE.selected) || '').trim();
  }

  function setCurrentPositionId(id) {
    const normalized = String(id || '').trim();
    const url = getUrl();

    if (normalized) {
      url.searchParams.set('pda', normalized);
      storageSet(DB_STORAGE.selected, normalized);
    } else {
      url.searchParams.delete('pda');
      storageRemove(DB_STORAGE.selected);
    }
    url.searchParams.delete('new');

    history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function isReturningFromCalculatorPage() {
    const ref = String(document.referrer || '').trim();
    if (!ref) return false;
    let refUrl = null;
    try {
      refUrl = new URL(ref);
    } catch (error) {
      return false;
    }
    if (!refUrl || refUrl.origin !== window.location.origin) return false;
    const fileName = refUrl.pathname.split('/').pop() || '';
    return CALCULATOR_PAGE_NAMES.has(fileName.toLowerCase());
  }

  function readMetadataFromForm() {
    return {
      date: readField('dateInput'),
      vesselName: readField('vesselNameIndex'),
      berthTerminal: readField('berthTerminal'),
      operation: readField('operationsInput'),
      quantity: readField('quantityInput'),
      cargo: readField('cargoInput'),
      agent: readField('agentInput')
    };
  }

  function snapshotIndexState() {
    if (typeof saveIndexState === 'function') {
      saveIndexState();
    }
    return readJson(storageGet(DB_STORAGE.indexState), null);
  }

  function snapshotCalculatorState() {
    const state = {};
    NEW_DRAFT_RESET_KEYS.forEach((key) => {
      const value = storageGet(key);
      if (value === null) return;
      state[key] = value;
    });
    return Object.keys(state).length ? state : null;
  }

  function applyCalculatorState(state) {
    const normalizedState = normalizeCalculatorState(state);
    if (!normalizedState) return false;
    NEW_DRAFT_RESET_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(normalizedState, key)) {
        storageSet(key, normalizedState[key]);
      } else {
        storageRemove(key);
      }
    });
    return true;
  }

  function syncSharedValuesFromForm() {
    const vesselName = readField('vesselNameIndex');
    const gt = readField('grossTonnage');
    const quantity = readField('quantityInput');

    if (vesselName) storageSet(DB_STORAGE.vesselName, vesselName);
    else storageRemove(DB_STORAGE.vesselName);

    if (gt) storageSet(DB_STORAGE.gt, gt);
    else storageRemove(DB_STORAGE.gt);

    if (quantity) storageSet(DB_STORAGE.quantity, quantity);
    else storageRemove(DB_STORAGE.quantity);
  }

  function buildRecord(existingId, existingRecord) {
    const metadata = readMetadataFromForm();
    const nowIso = new Date().toISOString();
    const stableId = existingId || makeId();
    let createdAt =
      toIsoOrEmpty(existingRecord && existingRecord.createdAt) ||
      toIsoOrEmpty(existingRecord && existingRecord.savedAt);
    if (!createdAt) {
      const idTimestamp = getIdTimestamp(stableId);
      if (Number.isFinite(idTimestamp)) createdAt = new Date(idTimestamp).toISOString();
    }
    if (!createdAt) createdAt = nowIso;
    const calculatorState =
      snapshotCalculatorState() ||
      normalizeCalculatorState(existingRecord && existingRecord.calculatorState);

    return {
      id: stableId,
      date: metadata.date,
      vesselName: metadata.vesselName,
      berthTerminal: metadata.berthTerminal,
      operation: metadata.operation,
      quantity: metadata.quantity,
      cargo: metadata.cargo,
      agent: metadata.agent,
      createdAt,
      savedAt: nowIso,
      indexState: snapshotIndexState(),
      calculatorState
    };
  }

  function getRecordSignature(record) {
    if (!record || typeof record !== 'object') return '';
    const payload = {
      id: String(record.id || ''),
      date: String(record.date || ''),
      vesselName: String(record.vesselName || ''),
      berthTerminal: String(record.berthTerminal || ''),
      operation: String(record.operation || ''),
      quantity: String(record.quantity || ''),
      cargo: String(record.cargo || ''),
      agent: String(record.agent || ''),
      createdAt: String(record.createdAt || ''),
      indexState: record.indexState && typeof record.indexState === 'object' ? record.indexState : null,
      calculatorState: normalizeCalculatorState(record.calculatorState)
    };
    try {
      return JSON.stringify(payload);
    } catch (error) {
      return `${payload.id}|${payload.date}|${payload.vesselName}|${payload.createdAt}`;
    }
  }

  function clearAutosaveTimer() {
    if (!autosaveTimer) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  async function renderPositionsTable() {
    if (!tableBody) return;

    const currentId = getCurrentPositionId();
    let positions = [];

    try {
      positions = await getPositions();
    } catch (error) {
      setStatus('Unable to load PDA positions.', true);
      return;
    }
    positions = sortPositionsForDisplay(positions, getSortModePreference());
    const searchQuery = getSearchQuery();
    if (searchQuery) {
      positions = positions.filter((position) => matchesSearchQuery(position, searchQuery));
    }

    tableBody.innerHTML = '';

    if (positions.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 9;
      emptyCell.className = 'pda-db-empty';
      emptyCell.textContent = searchQuery ? 'No matching PDA positions found.' : 'No PDA positions saved yet.';
      emptyRow.appendChild(emptyCell);
      tableBody.appendChild(emptyRow);
      return;
    }

    positions.forEach((position) => {
      const row = document.createElement('tr');
      if (currentId && position.id === currentId) {
        row.classList.add('pda-db-active');
      }

      const actionCell = document.createElement('td');
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'mini pda-db-edit-btn';
      editButton.setAttribute('aria-label', 'Edit PDA');
      editButton.title = 'Edit';
      editButton.dataset.action = 'edit';
      editButton.dataset.id = position.id;
      const editIcon = document.createElement('img');
      editIcon.src = 'assets/icons/square-pen.svg';
      editIcon.alt = '';
      editButton.appendChild(editIcon);
      actionCell.appendChild(editButton);
      row.appendChild(actionCell);

      const dateCell = document.createElement('td');
      dateCell.textContent = position.date || '-';
      row.appendChild(dateCell);

      const vesselCell = document.createElement('td');
      const vesselName = document.createElement('div');
      vesselName.className = 'pda-db-vessel';
      vesselName.textContent = position.vesselName || 'Untitled PDA';
      vesselCell.appendChild(vesselName);

      const savedAt = document.createElement('div');
      savedAt.className = 'pda-db-saved';
      savedAt.textContent = `Edited: ${formatSavedAt(position.savedAt)}`;
      vesselCell.appendChild(savedAt);
      row.appendChild(vesselCell);

      const berthTerminalCell = document.createElement('td');
      berthTerminalCell.textContent = position.berthTerminal || position.port || '-';
      row.appendChild(berthTerminalCell);

      const operationCell = document.createElement('td');
      operationCell.textContent = position.operation || '-';
      row.appendChild(operationCell);

      const quantityCell = document.createElement('td');
      quantityCell.textContent = position.quantity || '-';
      row.appendChild(quantityCell);

      const cargoCell = document.createElement('td');
      cargoCell.textContent = position.cargo || '-';
      row.appendChild(cargoCell);

      const agentCell = document.createElement('td');
      agentCell.textContent = position.agent || '-';
      row.appendChild(agentCell);

      const deleteCell = document.createElement('td');
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'mini pda-db-delete-btn';
      deleteButton.setAttribute('aria-label', 'Delete PDA');
      deleteButton.title = 'Delete';
      deleteButton.dataset.action = 'delete';
      deleteButton.dataset.id = position.id;
      const deleteIcon = document.createElement('img');
      deleteIcon.src = 'assets/icons/trash.svg';
      deleteIcon.alt = '';
      deleteButton.appendChild(deleteIcon);
      deleteCell.appendChild(deleteButton);
      row.appendChild(deleteCell);

      tableBody.appendChild(row);
    });
  }

  function getTodayDateValue() {
    const now = new Date();
    const day = String(now.getDate());
    const month = String(now.getMonth() + 1);
    const year = String(now.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  }

  function setTodayDateIfPossible() {
    const dateInput = document.getElementById('dateInput');
    if (!dateInput) return;
    dateInput.value = getTodayDateValue();
  }

  function resetCalculatorStorageForNewDraft() {
    NEW_DRAFT_RESET_KEYS.forEach((key) => storageRemove(key));
  }

  function rowUsesCalculatorEdit(row) {
    if (!row) return false;
    if (row.querySelector('.row-edit')) return true;
    const descField = row.querySelector('td.desc textarea, td.desc input');
    const desc = String(descField && descField.value ? descField.value : '').trim().toUpperCase();
    return (
      desc.startsWith('LIGHT DUES') ||
      desc.startsWith('PORT DUES') ||
      desc.startsWith('PILOTAGE') ||
      desc.startsWith('PILOT BOAT') ||
      desc.startsWith('MOORING/UNMOORING') ||
      desc.startsWith('TOWAGE')
    );
  }

  function resetEditablePdaCellsToZero() {
    const outlaysBody = document.getElementById('outlaysBody');
    if (!outlaysBody) return;
    const zeroFormatted = typeof formatMoneyValue === 'function' ? formatMoneyValue(0) : '0,00';

    outlaysBody.querySelectorAll('tr').forEach((row) => {
      if (!rowUsesCalculatorEdit(row)) return;
      const pdaInput = row.querySelector('td:nth-child(2) input.cell-input.money');
      if (!pdaInput) return;
      pdaInput.value = zeroFormatted;
      delete pdaInput.dataset.rawValue;
    });
  }

  function clearFormForNewPda() {
    storageRemove(DB_STORAGE.indexState);
    storageRemove(DB_STORAGE.vesselName);
    storageRemove(DB_STORAGE.gt);
    storageRemove(DB_STORAGE.quantity);
    storageRemove(DB_STORAGE.selected);
    resetCalculatorStorageForNewDraft();

    writeField('logoLeftNote', '');
    writeField('titleNote', '');
    writeField('vesselNameIndex', '');
    writeField('grossTonnage', '');
    writeField('lengthOverall', '');
    writeField('bowThrusterFitted', '');
    writeField('portInput', '');
    writeField('berthTerminal', '');
    writeField('operationsInput', '');
    writeField('cargoInput', '');
    writeField('quantityInput', '');
    writeField('agentInput', '');
    writeField('globalImoTransport', false);
    setTodayDateIfPossible();

    if (typeof setGlobalImoTransportState === 'function') {
      setGlobalImoTransportState(false);
    }
    if (typeof updateImoToggleLabelColor === 'function') {
      updateImoToggleLabelColor(document.getElementById('globalImoTransport'));
    }

    resetEditablePdaCellsToZero();

    if (typeof updateTowageFromStorage === 'function') updateTowageFromStorage();
    if (typeof updateLightDuesFromStorage === 'function') updateLightDuesFromStorage();
    if (typeof updatePortDuesFromStorage === 'function') updatePortDuesFromStorage();
    if (typeof updatePilotageFromStorage === 'function') updatePilotageFromStorage();
    if (typeof updatePilotBoatFromStorage === 'function') updatePilotBoatFromStorage();
    if (typeof updateMooringFromStorage === 'function') updateMooringFromStorage();
    if (typeof recalcOutlayTotals === 'function') recalcOutlayTotals();

    if (typeof saveIndexState === 'function') saveIndexState();
  }

  function focusVesselInput() {
    const vesselField = document.getElementById('vesselNameIndex');
    if (!vesselField) return;
    vesselField.focus();
    vesselField.select();
  }

  function restoreRecordToForm(record) {
    if (!record || typeof record !== 'object') return;
    const returningFromCalculator = isReturningFromCalculatorPage();

    if (!returningFromCalculator && record.indexState && typeof record.indexState === 'object') {
      storageSet(DB_STORAGE.indexState, JSON.stringify(record.indexState));
      if (typeof restoreIndexState === 'function') restoreIndexState();
    }

    if (!returningFromCalculator) {
      writeField('dateInput', record.date || '');
      writeField('vesselNameIndex', record.vesselName || '');
      writeField('berthTerminal', record.berthTerminal || record.port || '');
      writeField('operationsInput', record.operation || '');
      writeField('quantityInput', record.quantity || '');
      writeField('cargoInput', record.cargo || '');
      writeField('agentInput', record.agent || '');
      applyCalculatorState(record.calculatorState);
    }

    syncSharedValuesFromForm();

    if (typeof decorateOutlayRows === 'function') decorateOutlayRows();
    if (typeof wrapMoneyFields === 'function') wrapMoneyFields();
    if (typeof decorateMoneyEditCells === 'function') decorateMoneyEditCells();
    if (typeof recalcOutlayTotals === 'function') recalcOutlayTotals();
    if (typeof refreshOutlayLayout === 'function') refreshOutlayLayout();

    const toggleSailing = document.getElementById('toggleSailing');
    if (toggleSailing && typeof setSailingVisible === 'function') {
      setSailingVisible(Boolean(toggleSailing.checked));
    }

    if (typeof updateTowageFromStorage === 'function') updateTowageFromStorage();
    if (typeof updateLightDuesFromStorage === 'function') updateLightDuesFromStorage();
    if (typeof updatePortDuesFromStorage === 'function') updatePortDuesFromStorage();
    if (typeof updatePilotageFromStorage === 'function') updatePilotageFromStorage();
    if (typeof updatePilotBoatFromStorage === 'function') updatePilotBoatFromStorage();
    if (typeof updateMooringFromStorage === 'function') updateMooringFromStorage();

    if (typeof saveIndexState === 'function') saveIndexState();
  }

  async function saveCurrentPosition(options = {}) {
    const silent = Boolean(options.silent);
    const force = Boolean(options.force);
    const currentId = getCurrentPositionId();
    const record = buildRecord(currentId || '', activePositionRecord);
    const signature = getRecordSignature(record);

    if (!force && signature && signature === lastSavedRecordSignature) {
      return activePositionRecord || record;
    }

    try {
      await upsertPosition(record);
      setCurrentPositionId(record.id);
      activePositionRecord = { ...record };
      lastSavedRecordSignature = signature || getRecordSignature(record);
      if (!silent) {
        setStatus('PDA saved to database.', false);
      }
      if (tableBody) await renderPositionsTable();
      return record;
    } catch (error) {
      if (!silent) {
        setStatus('Failed to save PDA to database.', true);
      }
      return null;
    }
  }

  async function runAutosave(options = {}) {
    const silent = options.silent !== false;
    const force = Boolean(options.force);

    if (autosaveInFlight) {
      autosaveQueued = true;
      return null;
    }
    autosaveInFlight = true;

    try {
      return await saveCurrentPosition({ silent, force });
    } finally {
      autosaveInFlight = false;
      if (autosaveQueued) {
        autosaveQueued = false;
        void runAutosave({ silent: true, force: false });
      }
    }
  }

  function queueAutosave(delayMs = 600) {
    clearAutosaveTimer();
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      void runAutosave({ silent: true });
    }, Math.max(0, Number(delayMs) || 0));
  }

  function bindAutosaveListeners() {
    if (autosaveListenersBound) return;
    autosaveListenersBound = true;

    const schedule = () => {
      queueAutosave(600);
    };
    document.addEventListener('input', schedule, true);
    document.addEventListener('change', schedule, true);

    window.addEventListener('pagehide', () => {
      clearAutosaveTimer();
      void runAutosave({ silent: true, force: false });
    });
  }

  function openDashboard() {
    window.location.href = DASHBOARD_PAGE;
  }

  async function saveCurrentPositionAndOpenDashboard() {
    const record = await saveCurrentPosition();
    if (!record) return;
    openDashboard();
  }

  async function duplicateCurrentPosition() {
    const sourceRecord = buildRecord(getCurrentPositionId() || '', activePositionRecord);
    if (!sourceRecord) {
      setStatus('Failed to duplicate PDA.', true);
      return;
    }

    const nowIso = new Date().toISOString();
    const duplicatedDate = getTodayDateValue();
    const duplicatedIndexState =
      clonePlainObject(sourceRecord.indexState) ||
      snapshotIndexState() ||
      null;
    if (duplicatedIndexState && duplicatedIndexState.fields && typeof duplicatedIndexState.fields === 'object') {
      duplicatedIndexState.fields.dateInput = duplicatedDate;
    }
    const duplicatedRecord = {
      ...sourceRecord,
      id: makeId(),
      date: duplicatedDate,
      createdAt: nowIso,
      savedAt: nowIso,
      indexState: duplicatedIndexState,
      calculatorState:
        normalizeCalculatorState(clonePlainObject(sourceRecord.calculatorState)) ||
        snapshotCalculatorState() ||
        null
    };

    try {
      await upsertPosition(duplicatedRecord);
      writeField('dateInput', duplicatedDate);
      setCurrentPositionId(duplicatedRecord.id);
      activePositionRecord = clonePlainObject(duplicatedRecord) || { ...duplicatedRecord };
      lastSavedRecordSignature = getRecordSignature(duplicatedRecord);
      if (tableBody) await renderPositionsTable();
      setStatus('PDA duplicated. You are editing a new copy.', false);
    } catch (error) {
      setStatus('Failed to duplicate PDA.', true);
    }
  }

  function openNewDraftInForm() {
    clearAutosaveTimer();
    storageRemove(DB_STORAGE.indexState);
    storageRemove(DB_STORAGE.vesselName);
    storageRemove(DB_STORAGE.gt);
    storageRemove(DB_STORAGE.quantity);
    storageRemove(DB_STORAGE.selected);
    window.location.href = `${FORM_PAGE}?new=1`;
  }

  function openRecordInForm(recordId) {
    const id = String(recordId || '').trim();
    if (!id) return;
    storageSet(DB_STORAGE.selected, id);
    window.location.href = `${FORM_PAGE}?pda=${encodeURIComponent(id)}`;
  }

  async function deleteRecordFromDatabase(recordId) {
    const id = String(recordId || '').trim();
    if (!id) return;

    const confirmed = window.confirm('Delete this PDA position from database?');
    if (!confirmed) return;

    let deleted = false;
    try {
      deleted = await deletePosition(id);
    } catch (error) {
      setStatus('Failed to delete PDA position.', true);
      return;
    }

    if (!deleted) return;

    if (getCurrentPositionId() === id) {
      setCurrentPositionId('');
    }
    setStatus('PDA position deleted from database.', false);
    await renderPositionsTable();
  }

  async function handleTableClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const recordId = button.dataset.id;

    if (action === 'edit') {
      openRecordInForm(recordId);
      return;
    }
    if (action === 'delete') {
      await deleteRecordFromDatabase(recordId);
    }
  }

  function initDashboard() {
    if (!tableBody) return;
    bindDashboardIconAnimations();
    storageRemove(DB_STORAGE.searchQuery);

    const addBtn = document.getElementById('addPdaPositionBtn');
    if (addBtn) addBtn.addEventListener('click', openNewDraftInForm);

    searchInput = document.getElementById('pdaSearchInput');
    if (searchInput) {
      setSearchQuery('');
      searchInput.addEventListener('input', () => {
        setSearchQuery(searchInput.value);
        void renderPositionsTable();
      });
    }

    sortModeSelect = document.getElementById('pdaSortMode');
    sortModeToggle = document.getElementById('pdaSortModeToggle');
    sortModeButtons = sortModeToggle
      ? Array.from(sortModeToggle.querySelectorAll('button[data-sort-mode]'))
      : [];

    setSortModePreference(storageGet(DB_STORAGE.sortMode));

    if (sortModeSelect) {
      sortModeSelect.addEventListener('change', () => {
        setSortModePreference(sortModeSelect.value);
        void renderPositionsTable();
      });
    }

    if (sortModeToggle) {
      sortModeToggle.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-sort-mode]');
        if (!button || !sortModeToggle.contains(button)) return;
        setSortModePreference(button.dataset.sortMode);
        void renderPositionsTable();
      });
    }

    tableBody.addEventListener('click', (event) => {
      void handleTableClick(event);
    });

    void renderPositionsTable();
  }

  async function initFormPage() {
    const vesselField = document.getElementById('vesselNameIndex');
    if (!vesselField) return;

    window.requestPdaAutosaveNow = async (options = {}) => {
      clearAutosaveTimer();
      return runAutosave({
        silent: options.silent !== false,
        force: Boolean(options.force)
      });
    };
    bindAutosaveListeners();

    const saveBtn = document.getElementById('savePdaPositionBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        void saveCurrentPosition({ silent: false, force: true });
      });
    }

    document.querySelectorAll('#openPdaDatabaseBtn, #openPdaDatabaseTopBtn').forEach((homeBtn) => {
      homeBtn.addEventListener('click', () => {
        void saveCurrentPositionAndOpenDashboard();
      });
    });

    const duplicateTopBtn = document.getElementById('duplicatePdaTopBtn');
    if (duplicateTopBtn) {
      duplicateTopBtn.addEventListener('click', () => {
        void duplicateCurrentPosition();
      });
    }

    if (isNewMode()) {
      activePositionRecord = null;
      lastSavedRecordSignature = '';
      clearFormForNewPda();
      setStatus('New PDA ready. Enter Vessel Name.', false);
      focusVesselInput();
      return;
    }

    const currentId = getCurrentPositionId();
    if (!currentId) {
      activePositionRecord = null;
      return;
    }

    let positions = [];
    try {
      positions = await getPositions();
    } catch (error) {
      setStatus('Unable to load selected PDA record.', true);
      return;
    }

    const currentRecord = positions.find((item) => item.id === currentId);
    if (!currentRecord) {
      activePositionRecord = null;
      lastSavedRecordSignature = '';
      setStatus('Selected PDA record was not found.', true);
      return;
    }

    activePositionRecord = { ...currentRecord };
    lastSavedRecordSignature = getRecordSignature(currentRecord);
    restoreRecordToForm(currentRecord);
    setCurrentPositionId(currentRecord.id);
    setStatus(`Opened PDA: ${currentRecord.vesselName || 'Untitled PDA'}.`, false);
    queueAutosave(150);
  }

  function initPdaDatabase() {
    tableBody = document.getElementById('pdaDatabaseBody');
    statusNode = document.getElementById('pdaDatabaseStatus');

    initDashboard();
    void initFormPage();
  }

  window.addEventListener('DOMContentLoaded', initPdaDatabase);
})();
