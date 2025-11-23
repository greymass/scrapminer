include .env

SHELL := /usr/bin/env bash
BIN := ./node_modules/.bin
OS := $(shell uname)
VERSION := $(shell git describe --tags --always --abbrev=0 2>/dev/null || echo "dev")

RELEASE_NAME := scrapminer

# Default target
.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help message
	@echo "Scrapminer Build System"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_/-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

.PHONY: install
install: node_modules ## Install dependencies

node_modules:
	bun install --frozen-lockfile

.PHONY: dev
dev: install ## Run in development mode with hot reload
	bun run dev

.PHONY: dev/once
dev/once: install ## Run single claim cycle (development)
	bun run --hot src/index.ts once

.PHONY: start
start: install ## Start the service (daemon mode)
	bun src/index.ts start

.PHONY: once
once: install ## Run single claim cycle and exit
	bun src/index.ts once

.PHONY: config
config: install ## Display current configuration
	bun src/index.ts config

.PHONY: test
test: install ## Run all tests
	bun test

.PHONY: test/unit
test/unit: install ## Run unit tests only
	bun test test/utils.test.ts test/rootconfig.test.ts test/config.test.ts

.PHONY: test/integration
test/integration: install ## Run integration tests only
	bun test test/websocket.test.ts test/claimer.test.ts

.PHONY: test/watch
test/watch: install ## Run tests in watch mode
	bun test --watch

.PHONY: test/coverage
test/coverage: install ## Run tests with coverage
	bun test --coverage

.PHONY: check
check: install ## Run linting checks
	bun run lint

.PHONY: format
format: install ## Format code with Biome
	bun run format

.PHONY: build
build: install clean/dist ## Build binary for current platform
	bun build src/index.ts --compile --minify --sourcemap --outfile dist/$(RELEASE_NAME)

# Cross-platform builds
dist/$(RELEASE_NAME)-linux-x64: install
	bun build --target=bun-linux-x64 --compile --minify --sourcemap src/index.ts --outfile dist/$(RELEASE_NAME)-linux-x64

dist/$(RELEASE_NAME)-linux-arm64: install
	bun build --target=bun-linux-arm64 --compile --minify --sourcemap src/index.ts --outfile dist/$(RELEASE_NAME)-linux-arm64

dist/$(RELEASE_NAME)-linux-x64-musl: install
	bun build --target=bun-linux-x64-musl --compile --minify --sourcemap src/index.ts --outfile dist/$(RELEASE_NAME)-linux-x64-musl

dist/$(RELEASE_NAME)-linux-arm64-musl: install
	bun build --target=bun-linux-arm64-musl --compile --minify --sourcemap src/index.ts --outfile dist/$(RELEASE_NAME)-linux-arm64-musl

dist/$(RELEASE_NAME)-darwin-x64: install
	bun build --target=bun-darwin-x64 --compile --minify --sourcemap src/index.ts --outfile dist/$(RELEASE_NAME)-darwin-x64

dist/$(RELEASE_NAME)-darwin-arm64: install
	bun build --target=bun-darwin-arm64 --compile --minify --sourcemap src/index.ts --outfile dist/$(RELEASE_NAME)-darwin-arm64

.PHONY: release
release: clean install dist/$(RELEASE_NAME)-linux-x64 dist/$(RELEASE_NAME)-linux-arm64 dist/$(RELEASE_NAME)-linux-x64-musl dist/$(RELEASE_NAME)-linux-arm64-musl ## Build all release binaries and create GitHub release
	gzip dist/*
	git push
	git push --tags
	gh release create $(VERSION) ./dist/*.gz --generate-notes -t $(VERSION)

.PHONY: clean
clean: clean/dist clean/logs ## Clean all generated files

.PHONY: clean/dist
clean/dist: ## Clean built binaries
	rm -rf dist

.PHONY: clean/logs
clean/logs: ## Clean log files
	rm -f logs/*.log

.PHONY: clean/node_modules
clean/node_modules: ## Clean node_modules
	rm -rf node_modules
