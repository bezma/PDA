require('dotenv').config();

const express = require('express');
const path = require('node:path');
const {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  createSessionToken,
  normalizeUsername,
  parseCookies,
  verifyPassword,
  verifySessionToken
} = require('./lib/auth');
const { createPool } = require('./lib/db-config');
const { applyMigrations } = require('./lib/migrations');

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const ROOT_DIR = path.resolve(__dirname);
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const LOGIN_PAGE = path.join(PUBLIC_DIR, 'login.html');

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

function normalizeCalculatorState(rawState) {
  if (!rawState || typeof rawState !== 'object') return null;
  const normalized = {};
  Object.entries(rawState).forEach(([key, value]) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    if (value === null || value === undefined) return;
    normalized[normalizedKey] = String(value);
  });
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeRecord(record, existingRecord = null) {
  if (!record || typeof record !== 'object') return null;

  const id = String(record.id || '').trim();
  if (!id) return null;

  const normalizeText = (value) => String(value == null ? '' : value).trim();

  let indexState = null;
  if (record.indexState && typeof record.indexState === 'object') {
    indexState = record.indexState;
  }

  const savedAt =
    toIsoOrEmpty(record.savedAt) ||
    toIsoOrEmpty(existingRecord && existingRecord.savedAt) ||
    new Date().toISOString();

  let createdAt =
    toIsoOrEmpty(record.createdAt) ||
    toIsoOrEmpty(existingRecord && existingRecord.createdAt);
  if (!createdAt) {
    const idTimestamp = getIdTimestamp(id);
    if (idTimestamp) createdAt = new Date(idTimestamp).toISOString();
  }
  if (!createdAt) {
    createdAt = toIsoOrEmpty(existingRecord && existingRecord.savedAt) || savedAt;
  }

  const quantityFromState = indexState && indexState.fields && indexState.fields.quantityInput;
  const quantitySource =
    (record.quantity != null && String(record.quantity).trim() !== '' ? record.quantity : null) ??
    (quantityFromState != null && String(quantityFromState).trim() !== '' ? quantityFromState : null) ??
    (existingRecord ? existingRecord.quantity : null);
  const calculatorState =
    normalizeCalculatorState(record.calculatorState) ||
    normalizeCalculatorState(existingRecord && existingRecord.calculatorState);

  return {
    id,
    date: normalizeText(record.date),
    vesselName: normalizeText(record.vesselName),
    berthTerminal: normalizeText(record.berthTerminal || record.port),
    operation: normalizeText(record.operation),
    quantity: normalizeText(quantitySource),
    cargo: normalizeText(record.cargo),
    agent: normalizeText(record.agent),
    createdAt,
    savedAt,
    indexState,
    calculatorState
  };
}

function getCreatedSortTime(record) {
  const createdAtTime = new Date(record.createdAt).getTime();
  if (Number.isFinite(createdAtTime)) return createdAtTime;
  const idTimestamp = getIdTimestamp(record.id);
  if (Number.isFinite(idTimestamp)) return idTimestamp;
  const savedAtTime = new Date(record.savedAt).getTime();
  return Number.isFinite(savedAtTime) ? savedAtTime : 0;
}

function normalizePositions(positions) {
  if (!Array.isArray(positions)) return [];

  const normalized = positions
    .map(normalizeRecord)
    .filter(Boolean);

  normalized.sort((a, b) => {
    return getCreatedSortTime(b) - getCreatedSortTime(a);
  });

  return normalized;
}

function mapRowToRecord(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: String(row.id || '').trim(),
    date: String(row.date || '').trim(),
    vesselName: String(row.vessel_name || '').trim(),
    berthTerminal: String(row.berth_terminal || '').trim(),
    operation: String(row.operation || '').trim(),
    quantity: String(row.quantity || '').trim(),
    cargo: String(row.cargo || '').trim(),
    agent: String(row.agent || '').trim(),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    savedAt: row.saved_at ? new Date(row.saved_at).toISOString() : '',
    indexState: row.index_state && typeof row.index_state === 'object' ? row.index_state : null,
    calculatorState: row.calculator_state && typeof row.calculator_state === 'object' ? row.calculator_state : null
  };
}

const pool = createPool();

const UPSERT_POSITION_SQL = `
  INSERT INTO pda_positions (
    id, date, vessel_name, berth_terminal, operation, quantity, cargo, agent,
    created_at, saved_at, index_state, calculator_state
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8,
    $9::timestamptz, $10::timestamptz, $11::jsonb, $12::jsonb
  )
  ON CONFLICT (id) DO UPDATE SET
    date = EXCLUDED.date,
    vessel_name = EXCLUDED.vessel_name,
    berth_terminal = EXCLUDED.berth_terminal,
    operation = EXCLUDED.operation,
    quantity = EXCLUDED.quantity,
    cargo = EXCLUDED.cargo,
    agent = EXCLUDED.agent,
    created_at = EXCLUDED.created_at,
    saved_at = EXCLUDED.saved_at,
    index_state = EXCLUDED.index_state,
    calculator_state = EXCLUDED.calculator_state
`;

async function getPositionById(id, db = pool) {
  const queryResult = await db.query(
    `
      SELECT
        id, date, vessel_name, berth_terminal, operation, quantity, cargo, agent,
        created_at, saved_at, index_state, calculator_state
      FROM pda_positions
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );
  return mapRowToRecord(queryResult.rows[0]) || null;
}

async function getPositions() {
  const queryResult = await pool.query(`
    SELECT
      id, date, vessel_name, berth_terminal, operation, quantity, cargo, agent,
      created_at, saved_at, index_state, calculator_state
    FROM pda_positions
    ORDER BY created_at DESC
  `);

  return queryResult.rows
    .map(mapRowToRecord)
    .filter(Boolean);
}

async function upsertPosition(recordInput, db = pool) {
  const incomingId = String(recordInput && recordInput.id ? recordInput.id : '').trim();
  if (!incomingId) return null;

  const existingRecord = await getPositionById(incomingId, db);
  const normalized = normalizeRecord(recordInput, existingRecord);
  if (!normalized) return null;

  await db.query(UPSERT_POSITION_SQL, [
    normalized.id,
    normalized.date,
    normalized.vesselName,
    normalized.berthTerminal,
    normalized.operation,
    normalized.quantity,
    normalized.cargo,
    normalized.agent,
    normalized.createdAt,
    normalized.savedAt,
    normalized.indexState ? JSON.stringify(normalized.indexState) : null,
    normalized.calculatorState ? JSON.stringify(normalized.calculatorState) : null
  ]);

  return normalized;
}

async function deletePositionById(id) {
  const queryResult = await pool.query('DELETE FROM pda_positions WHERE id = $1', [id]);
  return queryResult.rowCount > 0;
}

async function getUserByUsername(username, db = pool) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;

  const queryResult = await db.query(
    `
      SELECT username, display_name, password_hash, is_active
      FROM pda_users
      WHERE username = $1
      LIMIT 1
    `,
    [normalizedUsername]
  );

  const row = queryResult.rows[0];
  if (!row) return null;
  return {
    username: String(row.username || '').trim(),
    displayName: String(row.display_name || '').trim(),
    passwordHash: String(row.password_hash || '').trim(),
    isActive: Boolean(row.is_active)
  };
}

function getRequestSessionToken(req) {
  const cookies = parseCookies(req.headers && req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || '';
}

async function getAuthenticatedUser(req) {
  const token = getRequestSessionToken(req);
  const session = verifySessionToken(token);
  if (!session) return null;

  const user = await getUserByUsername(session.username);
  if (!user || !user.isActive) return null;
  return {
    username: user.username,
    displayName: user.displayName
  };
}

function setSessionCookie(req, res, username) {
  const secure =
    Boolean(req.secure) ||
    String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  res.cookie(SESSION_COOKIE_NAME, createSessionToken(username), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_TTL_MS
  });
}

function clearSessionCookie(req, res) {
  const secure =
    Boolean(req.secure) ||
    String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/'
  });
}

function getSafeNextPath(value) {
  const nextPath = String(value || '').trim();
  if (!nextPath.startsWith('/')) return '/index.html';
  if (nextPath.startsWith('//')) return '/index.html';
  if (nextPath.includes('login.html')) return '/index.html';
  return nextPath || '/index.html';
}

async function requireApiAuth(req, res, next) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    req.authUser = user;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed.' });
  }
}

async function protectHtmlRequest(req, res, next) {
  const pathname = String(req.path || '').toLowerCase();
  if (!pathname.endsWith('.html')) {
    next();
    return;
  }
  if (pathname === '/login.html') {
    next();
    return;
  }

  try {
    const user = await getAuthenticatedUser(req);
    if (user) {
      req.authUser = user;
      next();
      return;
    }
  } catch (error) {
    // fall through to redirect
  }

  const nextPath = getSafeNextPath(req.originalUrl || req.path);
  res.redirect(`/login.html?next=${encodeURIComponent(nextPath)}`);
}

app.use(express.json({ limit: '3mb' }));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, at: new Date().toISOString(), database: 'postgres' });
  } catch (error) {
    res.status(503).json({ ok: false, at: new Date().toISOString(), error: 'Database unavailable.' });
  }
});

app.get('/api/auth/session', requireApiAuth, async (req, res) => {
  res.json({ authenticated: true, user: req.authUser });
});

app.post('/api/auth/login', async (req, res) => {
  const username = normalizeUsername(req.body && req.body.username);
  const password = String(req.body && req.body.password ? req.body.password : '');
  const nextPath = getSafeNextPath(req.body && req.body.next);

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }

  try {
    const user = await getUserByUsername(username);
    if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    setSessionCookie(req, res, user.username);
    res.json({
      ok: true,
      redirectTo: nextPath,
      user: {
        username: user.username,
        displayName: user.displayName
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  clearSessionCookie(req, res);
  res.status(204).send();
});

app.get('/', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    res.redirect(user ? '/index.html' : '/login.html');
  } catch (error) {
    res.redirect('/login.html');
  }
});

app.get('/login.html', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (user) {
      res.redirect('/index.html');
      return;
    }
  } catch (error) {
    // continue to login page
  }
  res.sendFile(LOGIN_PAGE);
});

app.get('/api/positions', requireApiAuth, async (req, res) => {
  try {
    const positions = await getPositions();
    res.json({ positions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load positions.' });
  }
});

app.get('/api/positions/:id', requireApiAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'Position id is required.' });
    return;
  }

  try {
    const record = await getPositionById(id);
    if (!record) {
      res.status(404).json({ error: 'Position not found.' });
      return;
    }
    res.json({ position: record });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load position.' });
  }
});

app.post('/api/positions', requireApiAuth, async (req, res) => {
  const incoming = req.body && typeof req.body === 'object' ? req.body : null;
  if (!incoming) {
    res.status(400).json({ error: 'Invalid position payload.' });
    return;
  }

  const incomingId = String(incoming.id || '').trim();
  if (!incomingId) {
    res.status(400).json({ error: 'Invalid position payload.' });
    return;
  }

  try {
    const savedRecord = await upsertPosition(incoming);
    if (!savedRecord) {
      res.status(400).json({ error: 'Invalid position payload.' });
      return;
    }
    res.status(201).json({ position: savedRecord });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save position.' });
  }
});

app.delete('/api/positions/:id', requireApiAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'Position id is required.' });
    return;
  }

  try {
    const deleted = await deletePositionById(id);
    if (!deleted) {
      res.status(404).json({ error: 'Position not found.' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete position.' });
  }
});

app.use(protectHtmlRequest);
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], index: false }));

async function startServer() {
  try {
    await pool.query('SELECT 1');
    await applyMigrations(pool, { verbose: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize PostgreSQL storage.', error);
    process.exit(1);
  }

  if (!String(process.env.SESSION_SECRET || '').trim()) {
    // eslint-disable-next-line no-console
    console.warn('SESSION_SECRET is not set. Using a development fallback secret.');
  }

  app.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`PDA server running at http://${HOST}:${PORT}`);
  });
}

async function shutdown() {
  try {
    await pool.end();
  } catch (error) {
    // ignore shutdown errors
  }
}

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});

void startServer();
