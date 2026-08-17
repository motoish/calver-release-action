import { describe, expect, it, vi } from 'vitest';

import { runAction } from '../src/action';
import type { ActionOutputs, GitHubPort } from '../src/types';

const sha = 'a1b2c3d4e5f678901234567890abcdef12345678';
const outputs: ActionOutputs = {
  version: '2026.8.17-a1b2c3d4',
  buildTag: 'v2026.8.17-a1b2c3d4',
  buildReleaseId: '1',
  buildReleaseUrl: 'https://github.test/releases/1',
  buildUploadUrl: 'https://uploads.github.test/releases/1/assets{?name,label}',
  channelTag: 'v2026.8.17',
  channelReleaseId: '2',
  channelReleaseUrl: 'https://github.test/releases/2',
  channelUploadUrl: 'https://uploads.github.test/releases/2/assets{?name,label}',
};

function coreWith(inputs: Record<string, string>) {
  return {
    getInput: vi.fn((name: string) => inputs[name] ?? ''),
    setOutput: vi.fn(),
    setFailed: vi.fn(),
  };
}

function dependencies(inputs: Record<string, string>) {
  const core = coreWith(inputs);
  const githubPort = {} as GitHubPort;
  const createClient = vi.fn(() => githubPort);
  const publishDaily = vi.fn().mockResolvedValue(outputs);
  const promoteStable = vi.fn().mockResolvedValue({
    ...outputs,
    version: '2026.8',
    channelTag: 'v2026.8',
  });
  return {
    core,
    context: {
      sha,
      repository: { owner: 'motoish', repo: 'example' },
    },
    now: () => new Date('2026-08-17T12:00:00Z'),
    createClient,
    publishDaily,
    promoteStable,
  };
}

describe('runAction', () => {
  it('defaults daily publication to UTC and emits all public outputs', async () => {
    const deps = dependencies({ mode: 'daily', token: 'secret-token' });

    await runAction(deps);

    expect(deps.createClient).toHaveBeenCalledWith('secret-token', {
      owner: 'motoish',
      repo: 'example',
    });
    expect(deps.publishDaily).toHaveBeenCalledWith({
      github: expect.anything(),
      identity: {
        year: 2026,
        month: 8,
        day: 17,
        sha,
        sha8: 'a1b2c3d4',
        version: '2026.8.17-a1b2c3d4',
        buildTag: 'v2026.8.17-a1b2c3d4',
        channelTag: 'v2026.8.17',
      },
      repository: { owner: 'motoish', repo: 'example' },
    });
    expect(deps.promoteStable).not.toHaveBeenCalled();
    expect(deps.core.setOutput.mock.calls).toEqual([
      ['version', outputs.version],
      ['build_tag', outputs.buildTag],
      ['build_release_id', outputs.buildReleaseId],
      ['build_release_url', outputs.buildReleaseUrl],
      ['build_upload_url', outputs.buildUploadUrl],
      ['channel_tag', outputs.channelTag],
      ['channel_release_id', outputs.channelReleaseId],
      ['channel_release_url', outputs.channelReleaseUrl],
      ['channel_upload_url', outputs.channelUploadUrl],
    ]);
    expect(deps.core.setFailed).not.toHaveBeenCalled();
  });

  it('dispatches promotion with an explicit immutable source tag', async () => {
    const deps = dependencies({
      mode: 'promote',
      token: 'secret-token',
      source_tag: 'v2026.8.17-a1b2c3d4',
    });

    await runAction(deps);

    expect(deps.promoteStable).toHaveBeenCalledWith({
      github: expect.anything(),
      sourceTag: 'v2026.8.17-a1b2c3d4',
      repository: { owner: 'motoish', repo: 'example' },
    });
    expect(deps.publishDaily).not.toHaveBeenCalled();
    expect(deps.core.setFailed).not.toHaveBeenCalled();
  });

  it('does not evaluate timezone or the clock in promote mode', async () => {
    const deps = dependencies({
      mode: 'promote',
      token: 'secret-token',
      timezone: 'Mars/Olympus',
      source_tag: 'v2026.8.17-a1b2c3d4',
    });
    deps.now = vi.fn(() => {
      throw new Error('clock must not be read during promotion');
    });

    await runAction(deps);

    expect(deps.now).not.toHaveBeenCalled();
    expect(deps.promoteStable).toHaveBeenCalledOnce();
    expect(deps.core.setFailed).not.toHaveBeenCalled();
  });

  it.each([
    [{ mode: 'nightly', token: 'secret-token' }, 'Invalid mode: nightly'],
    [{ mode: 'daily', token: '' }, 'Input token is required'],
    [
      { mode: 'promote', token: 'secret-token' },
      'Input source_tag is required when mode is promote',
    ],
    [
      {
        mode: 'daily',
        token: 'secret-token',
        source_tag: 'v2026.8.17-a1b2c3d4',
      },
      'Input source_tag is only valid when mode is promote',
    ],
    [
      { mode: 'daily', token: 'secret-token', timezone: 'Mars/Olympus' },
      'Invalid IANA timezone: Mars/Olympus',
    ],
  ])('fails invalid inputs before dispatching services', async (inputs, message) => {
    const deps = dependencies(inputs);

    await runAction(deps);

    expect(deps.core.setFailed).toHaveBeenCalledWith(message);
    expect(deps.publishDaily).not.toHaveBeenCalled();
    expect(deps.promoteStable).not.toHaveBeenCalled();
  });

  it('redacts the token from service errors', async () => {
    const deps = dependencies({ mode: 'daily', token: 'secret-token' });
    deps.publishDaily.mockRejectedValueOnce(
      new Error('GitHub rejected secret-token while creating a tag'),
    );

    await runAction(deps);

    expect(deps.core.setFailed).toHaveBeenCalledWith(
      'GitHub rejected *** while creating a tag',
    );
  });
});
