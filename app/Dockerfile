# syntax=docker/dockerfile:1
# Include build-stage packages in SBOM (multi-stage; Docker Scout / Desktop analysis).
ARG BUILDKIT_SBOM_SCAN_STAGE=true

FROM node:22-alpine AS build
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
RUN npm ci --foreground-scripts

COPY scripts/copy-ui-static.mjs ./scripts/copy-ui-static.mjs
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

ARG VITE_API_BASE=
ENV VITE_API_BASE=${VITE_API_BASE}

RUN npm run generate:api
RUN npm run build:domain
RUN npm run build:server-shared
RUN npm run build:flow-core
RUN npm exec -w @praxis-flow/ui -- svelte-kit sync
RUN npm run -w @praxis-flow/ui build
RUN npm run -w @praxis-flow/app build
RUN node scripts/copy-ui-static.mjs
RUN node scripts/strip-production-artifacts.mjs \
  packages/domain \
  packages/server-shared \
  packages/flow-core \
  dist:app/dist
RUN npm prune --omit=dev --foreground-scripts

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

ARG PRAXIS_FLOW_STACK_VERSION=
ENV PRAXIS_FLOW_STACK_VERSION=${PRAXIS_FLOW_STACK_VERSION}

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY package.json ./
COPY app/package.json ./app/package.json
COPY --from=build /app/node_modules ./node_modules
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
