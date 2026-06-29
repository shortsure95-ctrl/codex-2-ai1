FROM node:22-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/assets ./assets
COPY --from=build /app/memories.json ./memories.json
COPY --from=build /app/metadata.json ./metadata.json
COPY --from=build /app/firebase-applet-config.json ./firebase-applet-config.json
COPY --from=build /app/firebase-blueprint.json ./firebase-blueprint.json
COPY --from=build /app/firestore.rules ./firestore.rules

EXPOSE 3000
CMD ["npm", "start"]
