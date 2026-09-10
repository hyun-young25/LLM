FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js geminiProxy.js ./
COPY src ./src
RUN VITE_ENABLE_GEMINI=false npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 CLASSROOM_ENABLED=true CLASSROOM_DB_PATH=/data/classroom.sqlite
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server.mjs geminiProxy.js ./
COPY classroom ./classroom
COPY deploy ./deploy
COPY src/guidedModel.js src/relationshipActivities.js src/sampling.js src/connectedModel.js src/learningMath.js ./src/
EXPOSE 3000
CMD ["node", "server.mjs"]
