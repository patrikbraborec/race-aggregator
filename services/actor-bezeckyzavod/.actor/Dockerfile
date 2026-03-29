FROM apify/actor-node:22

# Copy shared package first
COPY ../shared /shared
WORKDIR /shared
RUN npm install --omit=dev

# Copy actor
WORKDIR /actor
COPY package*.json ./
RUN npm install --omit=dev --include=optional

COPY . ./

CMD ["node", "--loader", "tsx/esm", "src/main.ts"]
