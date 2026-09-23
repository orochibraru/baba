# Updates

## baba update

```bash
baba update
```

Asks GitHub for the latest stable release. When it's newer than the running
version, it downloads `baba-<os>-<arch>.gz`, and swaps it in place of the
running binary (following symlinks). If that directory isn't writable, the swap
goes through `sudo mv`. Then restart the service to run it:

```bash
baba restart
```

Canaries are never offered: a canary build (`X.Y.Z-canary.N`) updates to the
stable `X.Y.Z` once it's released, and to nothing before. A binary built from
source reports `dev` and never updates itself.

In Docker, pull a new image instead.

## New-version alerts

With `updates.notifyEnabled` (the default), every `baba start` checks once for a
newer release and, if there is one, sends
`baba vX.Y.Z is available (you're on vA.B.C). Run baba update to upgrade.`
through your notifiers. It's one check per start, not per cycle: expect it again
only after a restart.

`baba update` leaves a `.just_updated` marker next to the incident history; the
next start within 5 minutes skips the check, so a restart right after updating
doesn't announce the version you just installed.

## Releases

Every merge to `main` publishes a canary (a GitHub prerelease and the `canary`
image). The stable release waits in a `chore(release): X.Y.Z` pull request;
merging it tags `vX.Y.Z`, which `baba update`, the install script and the
`latest` image pick up.
