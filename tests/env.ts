// Imported first by server tests: an in-memory database and no external providers, so tests are
// hermetic and never call paid APIs even if a developer's .env holds real keys.

for (const key of [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'DEEPGRAM_API_KEY',
  'DID_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_ID',
]) {
  process.env[key] = '';
}
process.env.DB_FILE = ':memory:';
process.env.ADMIN_TOKEN = 'test-admin-token';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.FREE_MESSAGES = '3';
