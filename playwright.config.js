const { defineConfig } = require('@playwright/test');
const path = require('path');

const PUERTO = 3100;

module.exports = defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.js',
  timeout: 30000,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // Levanta la API real con una base de datos exclusiva para las pruebas E2E
  webServer: {
    command: 'node index.js',
    url: `http://localhost:${PUERTO}/api/health`,
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      PORT: String(PUERTO),
      SOCKET_PORT: '6162',
      DATA_DIR: path.join(__dirname, 'data-e2e'),
    },
  },
});
