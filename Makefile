PORT ?= 5173
PREVIEW_PORT ?= 4173
HOST ?= 0.0.0.0

.PHONY: help setup wasm build compile run dev preview kill restart clean fmt check validate-problems import-book-problems

help:
	@printf '%s\n' \
		'Targets:' \
		'  make setup              Install npm dependencies and ensure the wasm target exists' \
		'  make wasm               Compile Rust to WebAssembly into pkg/' \
		'  make build              Build the production site into dist/' \
		'  make compile            Alias for build' \
		'  make run                Kill any server on PORT, then start the dev server' \
		'  make preview            Kill any preview server, then serve dist/' \
		'  make restart            Alias for run' \
		'  make kill               Stop servers using PORT and PREVIEW_PORT' \
		'  make import-book-problems Import validated OCR book problems and answers' \
		'  make validate-problems  Check practice problem move gravity' \
		'  make fmt                Format Rust code' \
		'  make check              Run formatting, problem validation, and production build' \
		'  make clean              Remove generated build output'

setup:
	npm install
	rustup target add wasm32-unknown-unknown

wasm:
	npm run build:wasm

build:
	npm run build

compile: build

run: kill
	npm run dev -- --host $(HOST) --port $(PORT)

dev: run

preview: kill build
	npm run preview -- --host $(HOST) --port $(PREVIEW_PORT)

restart: run

kill:
	@for port in $(PORT) $(PREVIEW_PORT); do \
		if command -v lsof >/dev/null 2>&1; then \
			pids=$$(lsof -tiTCP:$$port -sTCP:LISTEN); \
			if [ -n "$$pids" ]; then \
				printf 'Stopping processes on port %s: %s\n' "$$port" "$$pids"; \
				kill $$pids 2>/dev/null || true; \
			fi; \
		elif command -v ss >/dev/null 2>&1; then \
			pids=$$(ss -ltnp "sport = :$$port" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u); \
			if [ -n "$$pids" ]; then \
				printf 'Stopping listening processes on port %s: %s\n' "$$port" "$$pids"; \
				kill $$pids 2>/dev/null || true; \
			fi; \
		else \
			printf 'No lsof or ss found; skipping port cleanup for %s\n' "$$port"; \
		fi; \
	done

validate-problems:
	node scripts/validate-problems.mjs

import-book-problems:
	node scripts/import-book-problems.mjs

fmt:
	cargo fmt

check: fmt validate-problems build

clean:
	rm -rf dist pkg target
