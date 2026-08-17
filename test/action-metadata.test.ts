import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

describe('action.yml public contract', () => {
  it('declares the exact inputs, outputs, and Node 24 entrypoint', async () => {
    const metadata = parse(await readFile('action.yml', 'utf8'));

    expect(metadata.inputs).toEqual({
      mode: {
        description: 'Operation to perform: daily or promote',
        required: true,
      },
      token: {
        description: 'GitHub token with contents: write permission',
        required: true,
      },
      timezone: {
        description: 'IANA timezone used to calculate the daily CalVer date',
        required: false,
        default: 'UTC',
      },
      source_tag: {
        description: 'Immutable build tag to promote when mode is promote',
        required: false,
      },
      now: {
        description:
          'Unix epoch seconds used as the daily calendar instant instead of the current time',
        required: false,
      },
      expected_version: {
        description:
          'Caller-computed daily version that must match before any GitHub writes',
        required: false,
      },
    });
    expect(Object.keys(metadata.outputs)).toEqual([
      'version',
      'build_tag',
      'build_release_id',
      'build_release_url',
      'build_upload_url',
      'channel_tag',
      'channel_release_id',
      'channel_release_url',
      'channel_upload_url',
    ]);
    expect(metadata.runs).toEqual({
      using: 'node24',
      main: 'dist/index.js',
    });
  });
});
