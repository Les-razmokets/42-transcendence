FROM node:24.21.0-alpine3.24

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci 

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json nest-cli.json src ./
RUN npm run build

COPY . .

CMD ["sh", "-c", "npm run db:migrate && npm run start:prod"]
