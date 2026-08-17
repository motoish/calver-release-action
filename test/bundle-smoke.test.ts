import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('packaged action', () => {
  it('starts under Node 24 without failing while loading bundled dependencies', () => {
    const result = spawnSync(process.execPath, ['dist/index.js'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        INPUT_MODE: 'invalid',
        INPUT_TOKEN: 'smoke-test-token',
        GITHUB_REPOSITORY: 'motoish/example',
        GITHUB_SHA: 'a1b2c3d4e5f678901234567890abcdef12345678',
      },
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('Invalid mode');
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(
      'Dynamic require',
    );
  });
});
