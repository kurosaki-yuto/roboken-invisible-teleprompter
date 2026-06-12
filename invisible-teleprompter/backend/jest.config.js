/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  // AWS/Stripe/SES クライアントに触れる lib/handlers は対象外。
  // 純粋ロジック (lib/validation.ts) のみをカバーする。
  collectCoverageFrom: ['lib/validation.ts'],
}
