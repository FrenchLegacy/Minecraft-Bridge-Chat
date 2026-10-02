FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
# @frenchlegacy/logging : archive locale (dépendance file:), source dans FrenchLegacy-Logging
COPY vendor/ ./vendor/
RUN npm install --production


FROM node:22-alpine AS production

RUN apk add --no-cache su-exec

WORKDIR /app
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src/    ./src/
COPY --chown=node:node config/ ./config/

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER root
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "src/main.js"]
