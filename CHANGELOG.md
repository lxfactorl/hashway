# Changelog

## [0.2.2](https://github.com/lxfactorl/hashway/compare/v0.2.1...v0.2.2) (2026-08-11)


### Bug Fixes

* checkout repo in act job so gh can resolve the repository ([#39](https://github.com/lxfactorl/hashway/issues/39)) ([91cc05a](https://github.com/lxfactorl/hashway/commit/91cc05a2d8b52e99525eceb038aa459c9b314350))
* correct dependabot triage output names and label idempotency ([#37](https://github.com/lxfactorl/hashway/issues/37)) ([ee3440a](https://github.com/lxfactorl/hashway/commit/ee3440af8e19ca28f76e9c05e569117106a11960))
* exit 0 after label removal check to avoid stray exit code ([#43](https://github.com/lxfactorl/hashway/issues/43)) ([4c599db](https://github.com/lxfactorl/hashway/commit/4c599dbe11a3cd89e69210a1f7ecf19610ead684))
* make needs-review label removal idempotent ([#41](https://github.com/lxfactorl/hashway/issues/41)) ([fffe99f](https://github.com/lxfactorl/hashway/commit/fffe99f4c25ee31ea581413de1f624c906fb41e4))


### Docs

* align documentation with current CI/CD and release pipeline ([#44](https://github.com/lxfactorl/hashway/issues/44)) ([773aab1](https://github.com/lxfactorl/hashway/commit/773aab1c9d8b208242664844bd1bb365b50fcc48))
* hold TypeScript on 5.x until typescript-eslint supports TS 7 (ADR-004) ([#51](https://github.com/lxfactorl/hashway/issues/51)) ([9762595](https://github.com/lxfactorl/hashway/commit/976259594e3c3d6dbc9892529f226949c838a060)), closes [#50](https://github.com/lxfactorl/hashway/issues/50)

## [0.2.1](https://github.com/lxfactorl/hashway/compare/v0.2.0...v0.2.1) (2026-08-11)


### Bug Fixes

* avoid double-v in release zip asset name ([#33](https://github.com/lxfactorl/hashway/issues/33)) ([df8dad3](https://github.com/lxfactorl/hashway/commit/df8dad3ae31117db52f95fdf504e4920175396b6))

## [0.2.0](https://github.com/lxfactorl/hashway/compare/v0.1.0...v0.2.0) (2026-08-11)


### Features

* AMO CI-signing and local extension updater ([#26](https://github.com/lxfactorl/hashway/issues/26)) ([8a53fe2](https://github.com/lxfactorl/hashway/commit/8a53fe281463a395b5905d0becd5e55174c96ddd))


### Docs

* add Dependabot automation implementation plan ([b401bc1](https://github.com/lxfactorl/hashway/commit/b401bc1cd183135d42f5a2a035e4b8ee334b2209))

## 0.1.0 (2026-08-11)


### Features

* add WXT MV2 config and hello-world background + options entrypoints ([35043a2](https://github.com/lxfactorl/hashway/commit/35043a26d35cb4118baee7dac0d50a666314fbea))


### Bug Fixes

* remove wxt/client from tsconfig types ([#10](https://github.com/lxfactorl/hashway/issues/10)) ([23a60e5](https://github.com/lxfactorl/hashway/commit/23a60e522d5a7cb6b9182c7d170a32a14964a827))


### Docs

* add web-ext config and ADR-001 (WXT MV2 gate outcome + Node 25 deviation) ([2ae749d](https://github.com/lxfactorl/hashway/commit/2ae749d37dad5e467d2ddcdde9593d130a7a6846))
* expand README with automated release flow and local verification gates ([dbdde68](https://github.com/lxfactorl/hashway/commit/dbdde685a461b746e774c0c3c88e8fa728ed37ee))


### Tests

* add hello-world E2E test (Selenium + geckodriver, CI-only) ([3b78d99](https://github.com/lxfactorl/hashway/commit/3b78d99833fc733ce5641732844c07d7a4f6aa4c))
* add manifest contract test against dist/manifest.json ([66ad935](https://github.com/lxfactorl/hashway/commit/66ad9354e14de81656d934ed74c3a3d14191de33))

## Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
