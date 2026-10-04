// Points every test run at the isolated test database instead of dev, so
// tests can't collide with each other or with real dev data. Must run before
// any file calls `new PrismaClient()`, since Prisma reads DATABASE_URL lazily
// from process.env at construction time.
require('dotenv').config({ path: '.env.test', override: true });
