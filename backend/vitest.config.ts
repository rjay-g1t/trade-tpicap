import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'backend', include: ['src/**/*.test.ts'], environment: 'node' },
});
