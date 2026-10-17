# syntax=docker/dockerfile:1
# Include build-stage packages in SBOM (multi-stage; Docker Scout / Desktop analysis).
ARG BUILDKIT_SBOM_SCAN_STAGE=true

# Keep build/runtime pins aligned in both service Dockerfiles; update deliberately.
FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY eslint.config.js ./
COPY app/package.json ./app/package.json
COPY ui/package.json ./ui/package.json
COPY sandbox/package.json ./sandbox/package.json
COPY setup/package.json ./setup/package.json
COPY manager/package.json ./manager/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/server-shared/package.json ./packages/server-shared/package.json
COPY packages/flow-core/package.json ./packages/flow-core/package.json

# Serial lifecycle scripts avoid esbuild ETXTBSY races in Docker/BuildKit.
RUN npm ci --foreground-scripts --no-audit

COPY scripts/copy-ui-static.mjs ./scripts/copy-ui-static.mjs
COPY scripts/build-typescript.mjs ./scripts/build-typescript.mjs
COPY scripts/production-artifacts.mjs ./scripts/production-artifacts.mjs
COPY scripts/check-production-artifacts.mjs ./scripts/check-production-artifacts.mjs
COPY scripts/strip-production-artifacts.mjs ./scripts/strip-production-artifacts.mjs
COPY scripts/bundle-openapi.mjs ./scripts/bundle-openapi.mjs
COPY scripts/generate-fastify-schemas.mjs ./scripts/generate-fastify-schemas.mjs
COPY scripts/generate-openapi-types.mjs ./scripts/generate-openapi-types.mjs
COPY scripts/generate-app-openapi-types.mjs ./scripts/generate-app-openapi-types.mjs
COPY scripts/openapi-types-lib.mjs ./scripts/openapi-types-lib.mjs
COPY scripts/openapi-lib.mjs ./scripts/openapi-lib.mjs
COPY scripts/prettier-write.mjs ./scripts/prettier-write.mjs
COPY openapi ./openapi
COPY app/tsconfig.json ./app/tsconfig.json
COPY app/src ./app/src
COPY packages/domain/tsconfig.json ./packages/domain/tsconfig.json
COPY packages/domain/src ./packages/domain/src
COPY packages/server-shared/tsconfig.json ./packages/server-shared/tsconfig.json
COPY packages/server-shared/src ./packages/server-shared/src
COPY packages/flow-core/tsconfig.json ./packages/flow-core/tsconfig.json
COPY packages/flow-core/tsconfig.base.json ./packages/flow-core/tsconfig.base.json
COPY packages/flow-core/src ./packages/flow-core/src
COPY packages/flow-core/db ./packages/flow-core/db
COPY ui/svelte.config.js ./ui/svelte.config.js
COPY ui/vite.config.ts ./ui/vite.config.ts
COPY ui/tsconfig.json ./ui/tsconfig.json
COPY ui/src ./ui/src
COPY ui/static ./ui/static

ARG VITE_API_BASE=
ENV VITE_API_BASE=${VITE_API_BASE}

RUN npm run generate:api
RUN npm run build:domain
RUN npm run build:server-shared
RUN npm run build:flow-core
RUN npm exec -w @wartezimmer/ui -- svelte-kit sync
RUN npm run -w @wartezimmer/ui build
RUN npm run -w @wartezimmer/app build
RUN node scripts/copy-ui-static.mjs
RUN node scripts/strip-production-artifacts.mjs \
  packages/domain \
  packages/server-shared \
  packages/flow-core \
  dist:app/dist
FROM build AS production-dependencies
COPY scripts/strip-dependency-artifacts.mjs ./scripts/strip-dependency-artifacts.mjs
# Install only the runtime dependency graph of this service, not UI/Manager/Setup.
RUN npm ci --omit=dev --ignore-scripts --no-audit \
  --workspace @wartezimmer/app \
  --workspace @wartezimmer/domain \
  --workspace @wartezimmer/server-shared \
  --workspace @wartezimmer/flow-core
RUN node scripts/strip-dependency-artifacts.mjs
RUN set -eu; for workspace in app packages/domain packages/server-shared packages/flow-core; do \
  mkdir -p "$workspace/node_modules"; \
  node scripts/strip-dependency-artifacts.mjs "$workspace/node_modules"; \
  done

FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS runtime
WORKDIR /app
ENV NODE_ENV=production

ARG WARTEZIMMER_STACK_VERSION=
ENV WARTEZIMMER_STACK_VERSION=${WARTEZIMMER_STACK_VERSION}

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY package.json ./
COPY LICENSE ./LICENSE
COPY app/package.json ./app/package.json
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/app/node_modules ./app/node_modules
COPY --from=production-dependencies /app/packages/domain/node_modules ./packages/domain/node_modules
COPY --from=production-dependencies /app/packages/server-shared/node_modules ./packages/server-shared/node_modules
COPY --from=production-dependencies /app/packages/flow-core/node_modules ./packages/flow-core/node_modules
COPY --from=build /app/packages/domain/package.json ./packages/domain/package.json
COPY --from=build /app/packages/domain/dist ./packages/domain/dist
COPY --from=build /app/packages/server-shared/package.json ./packages/server-shared/package.json
COPY --from=build /app/packages/server-shared/dist ./packages/server-shared/dist
COPY --from=build /app/packages/flow-core/package.json ./packages/flow-core/package.json
COPY --from=build /app/packages/flow-core/dist ./packages/flow-core/dist
COPY --from=build /app/packages/flow-core/db ./packages/flow-core/db
COPY --from=build /app/app/dist ./app/dist
# OpenAPI bundle + swagger packages stay build/dev-only (docs off in production images).

EXPOSE 8080
CMD ["node", "app/dist/server.js"]
