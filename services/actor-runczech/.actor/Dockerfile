FROM apify/actor-node-playwright-chrome:22

# Copy shared package first (as root for permissions)
USER root
COPY shared /shared
WORKDIR /shared
RUN npm install --omit=dev

# Copy actor
RUN mkdir -p /actor && chown myuser:myuser /actor
WORKDIR /actor
COPY package*.json ./
RUN chown myuser:myuser package*.json

USER myuser
RUN npm install --omit=dev --include=optional

COPY . ./

CMD ["node", "--import", "tsx", "src/main.ts"]
