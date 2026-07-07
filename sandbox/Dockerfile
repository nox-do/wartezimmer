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
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/server-shared/package.json ./packages/server-shared/package.json

RUN npm ci --foreground-scripts

COPY sandbox/tsconfig.json ./sandbox/tsconfig.json
COPY sandbox/src ./sandbox/src
COPY packages/server-shared/tsconfig.json ./packages/server-shared/tsconfig.json
COPY packages/server-shared/src ./packages/server-shared/src
COPY scripts/strip-production-artifacts.mjs ./scripts/strip-production-artifacts.mjs

RUN npm run build:server-shared
RUN npm run -w @praxis-flow/sandbox build
RUN node scripts/strip-production-artifacts.mjs packages/server-shared dist:sandbox/dist
RUN npm prune --omit=dev --foreground-scripts

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

RUN apk add --no-cache clamav clamav-libunrar \
  && mkdir -p /var/log/clamav \
  && chown clamav:clamav /var/log/clamav

COPY sandbox/clamav/freshclam.conf /etc/clamav/freshclam.conf

COPY package.json ./
COPY sandbox/package.json ./sandbox/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/server-shared/package.json ./packages/server-shared/package.json
COPY --from=build /app/packages/server-shared/dist ./packages/server-shared/dist
COPY --from=build /app/sandbox/dist ./sandbox/dist

EXPOSE 8081
CMD ["node", "sandbox/dist/entrypoint.js"]
