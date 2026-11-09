import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Testing Library only auto-cleans when test globals are on; they're off here.
afterEach(() => {
  cleanup();
});
