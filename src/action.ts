import type { InputOptions } from '@actions/core';

import type { PublishDailyOptions } from './daily';
import type { PromoteStableOptions } from './promote';
import type {
  ActionOutputs,
  GitHubPort,
  Repository,
} from './types';
import { createDailyIdentity, formatCalendarDate } from './version';

interface CorePort {
  getInput(name: string, options?: InputOptions): string;
  setOutput(name: string, value: string): void;
  setFailed(message: string): void;
}

interface ActionContext {
  sha: string;
  repository: Repository;
}

export interface ActionDependencies {
  core: CorePort;
  context: ActionContext;
  now: () => Date;
  createClient: (token: string, repository: Repository) => GitHubPort;
  publishDaily: (options: PublishDailyOptions) => Promise<ActionOutputs>;
  promoteStable: (options: PromoteStableOptions) => Promise<ActionOutputs>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setOutputs(core: CorePort, outputs: ActionOutputs): void {
  const values: Array<[string, string]> = [
    ['version', outputs.version],
    ['build_tag', outputs.buildTag],
    ['build_release_id', outputs.buildReleaseId],
    ['build_release_url', outputs.buildReleaseUrl],
    ['build_upload_url', outputs.buildUploadUrl],
    ['channel_tag', outputs.channelTag],
    ['channel_release_id', outputs.channelReleaseId],
    ['channel_release_url', outputs.channelReleaseUrl],
    ['channel_upload_url', outputs.channelUploadUrl],
  ];
  for (const [name, value] of values) {
    core.setOutput(name, value);
  }
}

export async function runAction(dependencies: ActionDependencies): Promise<void> {
  let token = '';
  try {
    const mode = dependencies.core.getInput('mode').trim();
    token = dependencies.core.getInput('token').trim();
    const timezone = dependencies.core.getInput('timezone').trim() || 'UTC';
    const sourceTag = dependencies.core.getInput('source_tag').trim();

    if (mode !== 'daily' && mode !== 'promote') {
      throw new Error(`Invalid mode: ${mode}`);
    }
    if (token === '') {
      throw new Error('Input token is required');
    }
    if (mode === 'promote' && sourceTag === '') {
      throw new Error('Input source_tag is required when mode is promote');
    }
    if (mode === 'daily' && sourceTag !== '') {
      throw new Error('Input source_tag is only valid when mode is promote');
    }

    const github = dependencies.createClient(token, dependencies.context.repository);
    const outputs =
      mode === 'daily'
        ? await dependencies.publishDaily({
            github,
            identity: createDailyIdentity(
              formatCalendarDate(dependencies.now(), timezone),
              dependencies.context.sha,
            ),
            repository: dependencies.context.repository,
          })
        : await dependencies.promoteStable({
            github,
            sourceTag,
            repository: dependencies.context.repository,
          });
    setOutputs(dependencies.core, outputs);
  } catch (error) {
    const message = errorMessage(error);
    dependencies.core.setFailed(
      token === '' ? message : message.split(token).join('***'),
    );
  }
}
