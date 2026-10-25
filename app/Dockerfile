FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /srv
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY server.js validators.js ./
COPY public ./public
RUN mkdir -p /srv/logs && chown -R node:node /srv
USER node
EXPOSE 3000
CMD ["node", "server.js"]
