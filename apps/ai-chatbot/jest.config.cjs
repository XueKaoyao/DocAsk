/** @type {import('jest').Config} */
const config = {
  displayName: 'ai-chatbot',
  rootDir: __dirname,

  // jsdom is required because components use browser APIs (window, document,
  // localStorage, IndexedDB, matchMedia, etc.)
  testEnvironment: 'jest-environment-jsdom',

  // Setup file: jest-dom matchers, fake-indexeddb, browser API mocks
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // Transform: ts-jest for all TS/TSX files with JSX support
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        // react-jsx transform is required for JSX to work in Jest
        tsx: 'react-jsx',
      },
    ],
  },

  // Transform workspace packages (symlinked in node_modules) and Ant Design
  transformIgnorePatterns: [
    'node_modules/(?!@myworkspace/|@ant-design/|antd/|ai/|@ai-sdk/|zod/|wink-bm25-text-search/|wink-helpers/|wink-nlp/|wink-nlp-utils/|wink-eng-lite-web-model/)',
  ],

  // Path and asset mapping — order matters (more specific first)
  moduleNameMapper: {
    // Path alias: @/* → apps/ai-chatbot/*
    '^@/(.*)$': '<rootDir>/$1',

    // CSS modules → identity-obj-proxy (returns class name as key)
    '\\.module\\.css$': 'identity-obj-proxy',

    // Plain CSS imports (Tailwind, global styles, antd x-markdown themes)
    '\\.css$': '<rootDir>/__mocks__/styleMock.ts',

    // Static file imports (SVGs, images)
    '\\.(svg|png|jpg|jpeg|gif|webp)$': '<rootDir>/__mocks__/fileMock.ts',
  },

  testMatch: [
    '<rootDir>/app/**/__tests__/**/*.test.{ts,tsx}',
    '<rootDir>/app/**/*.test.{ts,tsx}',
    '<rootDir>/eval/**/__tests__/**/*.test.{ts,tsx}',
  ],

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  clearMocks: true,
};

module.exports = config;
