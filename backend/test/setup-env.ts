// Runs before each test file. The suite truncates tables, so refuse anything that isn't a test DB.
const url = process.env.TEST_DATABASE_URL ?? "postgresql://janamen@localhost:5544/janamen_test?schema=public";
if (!/test/i.test(new URL(url).pathname)) {
  throw new Error(`Refusing to run e2e tests against "${url}": the database name must contain "test"`);
}
process.env.DATABASE_URL = url;
process.env.JWT_SECRET = "e2e-test-secret-0123456789";
process.env.NODE_ENV = "test";
