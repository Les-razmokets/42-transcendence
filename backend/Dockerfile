FROM node:24.21.0-alpine3.24

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY shared/package.json shared/
RUN npm ci -w backend -w @transcendence/shared

COPY shared/tsconfig.json shared/
COPY shared/src shared/src
RUN npm run build:shared

WORKDIR /app/backend

COPY backend/nest-cli.json backend/tsconfig.build.json  backend/tsconfig.json ./
COPY backend/prisma ./prisma
COPY backend/prisma7.config.ts ./
RUN npx prisma generate

COPY backend/src ./src
RUN npm run build

CMD ["sh", "-c", "npm run db:migrate && npm run start:prod"]
