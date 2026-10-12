FROM node:24.21.0-alpine3.24

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci 

COPY . .

CMD ["npm", "run", "dev", "--", "--host"]