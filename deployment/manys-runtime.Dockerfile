FROM node:24-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
WORKDIR /source
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY patches ./patches
COPY packages ./packages
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @dome/manys-runtime build && pnpm --filter @dome/manys-runtime deploy --prod --legacy /artifact
FROM scratch
LABEL org.opencontainers.image.title="Dome Manys runtime" org.opencontainers.image.version="0.1.0"
COPY --from=build /artifact /runtime
