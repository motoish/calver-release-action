import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

const temporaryDirectory = await mkdtemp(
  join(process.cwd(), '.calver-release-action-check-'),
);
const temporaryBundle = join(temporaryDirectory, 'index.js');

try {
  execFileSync(
    process.execPath,
    ['scripts/build.mjs', temporaryBundle],
    { stdio: 'inherit' },
  );

  const expected = readFileSync('dist/index.js');
  const actual = readFileSync(temporaryBundle);
  const expectedMap = readFileSync('dist/index.js.map');
  const actualMap = readFileSync(`${temporaryBundle}.map`);
  if (!expected.equals(actual) || !expectedMap.equals(actualMap)) {
    throw new Error(
      'dist/index.js is out of date; run npm run package and include the generated bundle',
    );
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
