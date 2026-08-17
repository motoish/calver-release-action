import * as core from '@actions/core';
import * as github from '@actions/github';

import { runAction } from './action';
import { publishDaily } from './daily';
import { createGitHubClient } from './github-client';
import { promoteStable } from './promote';

void runAction({
  core,
  context: {
    sha: github.context.sha,
    repository: github.context.repo,
  },
  now: () => new Date(),
  createClient: createGitHubClient,
  publishDaily,
  promoteStable,
});
