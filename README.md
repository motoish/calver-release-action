# CalVer Release Action

`motoish/calver-release-action` publishes immutable daily builds, maintains a
daily prerelease channel, and promotes an explicitly selected build to a
monthly stable release.

## Release model

| Layer | Example | Mutable | GitHub Release |
| --- | --- | --- | --- |
| Immutable build | `v2026.8.17-a1b2c3d4` | No | Pre-release, not latest |
| Daily channel | `v2026.8.17` | Fast-forward only | Pre-release, not latest |
| Monthly stable | `v2026.8` | No implicit replacement | Stable and latest |

The date uses UTC by default. Set `timezone` to an IANA timezone such as
`Asia/Tokyo` when a project needs another calendar boundary.

## Permissions

The calling job must grant `contents: write`. Pass the built-in
`github.token`; a personal access token is not required.

```yaml
permissions:
  contents: write
```

## Publish a daily build

Run the Action only after the caller's tests and packaging have succeeded.
Branch and event policy remain in the caller's workflow.

```yaml
name: Daily release

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Build and test
        run: ./scripts/build-and-test

      - name: Publish CalVer releases
        id: calver
        uses: motoish/calver-release-action@v1
        with:
          mode: daily
          token: ${{ github.token }}

      - name: Upload caller-owned assets to the immutable release
        env:
          GH_TOKEN: ${{ github.token }}
          BUILD_TAG: ${{ steps.calver.outputs.build_tag }}
        run: gh release upload "$BUILD_TAG" dist/app.tar.gz --clobber
```

The Action creates `vYYYY.M.D-<sha8>` for the current commit and creates or
fast-forwards `vYYYY.M.D`. If an older workflow finishes later, its immutable
release is retained but the daily channel does not move backward. Unrelated
commit histories fail instead of forcing the tag; in that failure the
immutable build release is still left published, only the daily channel update
is skipped.

When the caller computes the same CalVer before packaging, pass that instant
and version so the Action does not reread the clock after a long build:

```yaml
with:
  mode: daily
  timezone: Asia/Tokyo
  now: ${{ steps.identity.outputs.epoch }}
  expected_version: ${{ steps.identity.outputs.version }}
  token: ${{ github.token }}
```

A mismatched `expected_version` fails before any tag or Release is created.

To use another date boundary:

```yaml
with:
  mode: daily
  timezone: Asia/Tokyo
  token: ${{ github.token }}
```

## Promote a monthly stable release

Promotion requires the exact immutable source tag. The monthly version is
derived from that tag, not from the date on which promotion runs.

```yaml
name: Promote stable release

on:
  workflow_dispatch:
    inputs:
      source_tag:
        description: Immutable build tag, for example v2026.8.17-a1b2c3d4
        required: true
        type: string

permissions:
  contents: write

jobs:
  promote:
    runs-on: ubuntu-latest
    steps:
      - name: Promote immutable build
        id: calver
        uses: motoish/calver-release-action@v1
        with:
          mode: promote
          source_tag: ${{ inputs.source_tag }}
          token: ${{ github.token }}
```

The source tag must resolve to a published immutable pre-release created by
the daily flow, and its SHA must match the tag suffix. The suffix is an
8-character abbreviation, so a different commit with the same 8-character
prefix would pass this check; collisions are unlikely but possible. If
`vYYYY.M` already points to another commit, promotion fails without moving it.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `mode` | Yes | — | `daily` or `promote` |
| `token` | Yes | — | GitHub token with `contents: write` |
| `timezone` | No | `UTC` | IANA timezone used for daily dates |
| `source_tag` | In `promote` mode | — | Immutable tag selected for promotion |
| `now` | No | wall clock | Unix epoch seconds for the daily calendar instant |
| `expected_version` | No | — | Caller-computed daily version; must match before GitHub writes |

## Outputs

| Output | Description |
| --- | --- |
| `version` | CalVer without the leading `v` |
| `build_tag` | Immutable build tag; the promotion source in `promote` mode |
| `build_release_id` | Immutable build Release ID |
| `build_release_url` | Immutable build Release URL |
| `build_upload_url` | Immutable build asset upload URL |
| `channel_tag` | Daily or monthly channel tag |
| `channel_release_id` | Channel Release ID |
| `channel_release_url` | Channel Release URL |
| `channel_upload_url` | Channel asset upload URL |

## Asset and metadata ownership

The Action does not upload, copy, delete, or overwrite assets. Callers should
normally upload build artifacts only to the immutable Release using
`build_tag` or `build_upload_url`.

Immutable and stable Release bodies are initialized by the Action but are not
overwritten on retry, so maintainers may edit them. The daily channel body is
managed by the Action and always identifies its current immutable build.

## Development

```bash
npm ci
npm run verify
```

`dist/index.js` is committed as the runnable Action bundle. Run
`npm run package` after changing source code; `npm run check-package` verifies
that the bundle is current without modifying it.
