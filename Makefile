# Convenience targets; `npm run <target>` works identically on Windows without make.
.PHONY: setup dev backend frontend test lint build

setup:
	npm run setup

dev:
	npm run dev

backend:
	npm run dev:backend

frontend:
	npm run dev:frontend

test:
	npm test

lint:
	npm run lint

build:
	npm run build
