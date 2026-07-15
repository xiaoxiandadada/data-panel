FROM gitlab.pjlab.org.cn:5050/dps-registry/hub/node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --registry=https://npm.shlab.tech

FROM deps AS build

WORKDIR /app

COPY . .
RUN rm -rf dist && npm run build

FROM gitlab.pjlab.org.cn:5050/dps-registry/hub/node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5173

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --registry=https://npm.shlab.tech

COPY --from=build /app/dist ./dist
COPY scripts ./scripts
COPY docs ./docs

RUN addgroup -S app && adduser -S app -G app \
  && mkdir -p /app/data \
  && chown -R app:app /app

USER app

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5173) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server/main.js"]
