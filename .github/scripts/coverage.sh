#!/bin/sh
# Coverage of cmd/ and internal/ across all tests, including every run of the baba binary the
# integration tests build. Fails under MIN percent (default 70: the service package drives launchctl, systemctl and sudo, untested).
#   .github/scripts/coverage.sh   full suite
# Browse the result: go tool cover -html=coverage/profile.out
set -eu
min=${MIN:-70}
dir=$(pwd)/coverage
rm -rf "$dir"
mkdir -p "$dir/data"

run="go test"
if command -v gotestsum >/dev/null; then
	run="gotestsum --format testname --"
fi
BABA_COVERDIR="$dir/data" $run -count=1 "$@" -coverpkg=./cmd/...,./internal/... ./tests/... \
	-args -test.gocoverdir="$dir/data"

go tool covdata textfmt -i="$dir/data" -o "$dir/profile.out"
strip='s|github.com/orochibraru/baba/||'
echo
go tool covdata percent -i="$dir/data" | sed "$strip"
echo
echo "Not fully covered:"
go tool cover -func="$dir/profile.out" | grep -v -e '100.0%$' -e '^total:' | sed "$strip"
total=$(go tool cover -func="$dir/profile.out" | awk '/^total:/ { sub("%", "", $3); print $3 }')
echo
echo "total: $total% (min $min%)"
awk -v t="$total" -v m="$min" 'BEGIN { exit !(t >= m) }' || {
	echo "coverage under $min%" >&2
	exit 1
}
