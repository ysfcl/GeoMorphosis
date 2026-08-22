import Database from 'better-sqlite3';

const CREATE_EMAIL_SUBSCRIPTIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS email_subscriptions (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

function getDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL || 'file:./data/geopulse.db';

  if (!databaseUrl.startsWith('file:')) {
    throw new Error('E-posta abonelikleri için SQLite DATABASE_URL kullanılmalıdır.');
  }

  return databaseUrl.slice('file:'.length);
}

function withDatabase(callback) {
  const database = new Database(getDatabasePath());

  try {
    database.exec(CREATE_EMAIL_SUBSCRIPTIONS_TABLE);
    return callback(database);
  } finally {
    database.close();
  }
}

export function saveEmailSubscription(userId, email) {
  return withDatabase((database) => {
    database.prepare(`
      INSERT INTO email_subscriptions (user_id, email, is_active, updated_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        email = excluded.email,
        is_active = 1,
        updated_at = CURRENT_TIMESTAMP
    `).run(userId, email.trim().toLowerCase());

    return database.prepare(`
      SELECT user_id, email, is_active
      FROM email_subscriptions
      WHERE user_id = ?
    `).get(userId);
  });
}

export function getActiveEmailSubscription(userId) {
  if (!userId) return null;

  return withDatabase((database) => database.prepare(`
    SELECT user_id, email
    FROM email_subscriptions
    WHERE user_id = ? AND is_active = 1
  `).get(userId));
}
