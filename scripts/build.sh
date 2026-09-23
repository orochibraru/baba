#!/bin/sh
# Cross-compiles the release binaries into dist/, each also gzipped (what install.sh and 'baba update' download).
#   scripts/build.sh [version]
# Asset names keep the Bun era's x64 so older installs can update. -buildvcs=false: the release PR and
# its merge must build the same bytes.
set -eu
version=${1:-dev}
rm -rf dist
mkdir -p dist
for platform in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64; do
	os=${platform%/*}
	arch=${platform#*/}
	out="dist/baba-$os-$(echo "$arch" | sed 's/amd64/x64/')"
	CGO_ENABLED=0 GOOS=$os GOARCH=$arch go build -trimpath -buildvcs=false -ldflags="-s -w -X main.version=$version" -o "$out" ./cmd/baba
	gzip -9 -k "$out"
done
ls -l dist
