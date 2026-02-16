PLUGIN_ID ?= com.github.alun.user-status-dashboard
PLUGIN_VERSION ?= 0.1.0
BUNDLE_NAME ?= $(PLUGIN_ID)-$(PLUGIN_VERSION).tar.gz

GO ?= $(shell command -v go 2> /dev/null)
NPM ?= $(shell command -v npm 2> /dev/null)
MANIFEST_FILE ?= plugin.json

## Checks the code style, tests, builds, and bundles the plugin.
.PHONY: all
all: check-style test dist

## Runs go vet and eslint against all packages.
.PHONY: check-style
check-style: server/.depensure webapp/.npminstall
	cd server && $(GO) vet ./...

## Builds the server component.
.PHONY: server
server: server/.depensure
	mkdir -p server/dist
	cd server && env CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build -o dist/plugin-linux-amd64 ./...
	cd server && env CGO_ENABLED=0 GOOS=linux GOARCH=arm64 $(GO) build -o dist/plugin-linux-arm64 ./...
	cd server && env CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 $(GO) build -o dist/plugin-darwin-amd64 ./...
	cd server && env CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 $(GO) build -o dist/plugin-darwin-arm64 ./...

server/.depensure:
	cd server && $(GO) mod tidy
	touch $@

## Builds the webapp component.
.PHONY: webapp
webapp: webapp/.npminstall
	cd webapp && $(NPM) run build

webapp/.npminstall:
	cd webapp && $(NPM) install
	touch $@

## Bundles the plugin.
.PHONY: bundle
bundle:
	rm -rf dist/
	mkdir -p dist/$(PLUGIN_ID)/
	cp $(MANIFEST_FILE) dist/$(PLUGIN_ID)/
	mkdir -p dist/$(PLUGIN_ID)/server/dist
	cp -r server/dist/* dist/$(PLUGIN_ID)/server/dist/
	mkdir -p dist/$(PLUGIN_ID)/webapp/dist
	cp webapp/dist/main.js dist/$(PLUGIN_ID)/webapp/dist/
	mkdir -p dist/$(PLUGIN_ID)/assets
	cp -r assets/* dist/$(PLUGIN_ID)/assets/
	cd dist && tar -czf $(BUNDLE_NAME) $(PLUGIN_ID)

## Builds and bundles the plugin.
.PHONY: dist
dist: server webapp bundle

## Runs tests.
.PHONY: test
test: server/.depensure
	cd server && $(GO) test -v ./...

## Deploy to a Mattermost instance.
.PHONY: deploy
deploy: dist
	curl -F "plugin=@dist/$(BUNDLE_NAME)" -H "Authorization: Bearer $(MM_ADMIN_TOKEN)" $(MM_SERVICESETTINGS_SITEURL)/api/v4/plugins

## Clean build artifacts.
.PHONY: clean
clean:
	rm -rf dist/
	rm -rf server/dist/
	rm -rf webapp/dist/
	rm -rf webapp/node_modules/
	rm -f server/.depensure
	rm -f webapp/.npminstall
