FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./

COPY prisma ./prisma

RUN npm ci && npx prisma generate

COPY . .

CMD ["sh", "-c", "npm run db:migrate && npm start"]
