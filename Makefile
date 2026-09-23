VERSION ?= dev
CONFIG ?= config.json

.PHONY: build test cover lint run docker clean

build: ## Cross-compile the release binaries into dist/
	scripts/build.sh $(VERSION)

test: ## Unit and integration tests
	go test ./...

cover: ## Coverage across all tests; fails under 70%
	.github/scripts/coverage.sh

lint: ## Every prek hook on every file
	prek run --all-files

run: ## Run the monitor in the foreground against $(CONFIG)
	go run ./cmd/baba start --config $(CONFIG)

docker: ## Build the image as baba:$(VERSION)
	docker build --build-arg APP_VERSION=$(VERSION) -t baba:$(VERSION) .

clean:
	rm -rf dist coverage
