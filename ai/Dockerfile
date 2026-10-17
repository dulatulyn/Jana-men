FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY eval ./eval
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8001
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY kb ./kb
COPY mock ./mock
COPY eval/cases.json ./eval/cases.json
EXPOSE 8001
CMD ["node", "dist/src/index.js"]
