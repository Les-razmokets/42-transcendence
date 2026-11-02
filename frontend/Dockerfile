FROM node:24.21.0-alpine3.24

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY shared/package.json shared/
RUN npm ci -w frontend -w @transcendence/shared

COPY shared/ shared/

WORKDIR /app/frontend

COPY frontend/ ./.

CMD ["npm", "run", "dev", "--", "--host"]