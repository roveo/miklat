.PHONY: install build dev clean deploy

install:
	uv sync

build: clean
	mkdir -p dist/data dist/css dist/js dist/i18n dist/icons
	uv run python build/extract_kmz.py
	cp src/index.html dist/
	cp src/css/* dist/css/
	cp src/js/* dist/js/
	cp src/i18n/* dist/i18n/
	cp src/icons/* dist/icons/
	cp src/service-worker.js dist/
	cp src/manifest.json dist/

dev: build
	uv run python -m http.server 8000 --directory dist

clean:
	rm -rf dist

deploy:
	gh workflow run deploy-gh-pages.yml
