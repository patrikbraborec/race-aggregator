FROM apify/actor-node:22

WORKDIR /actor
COPY package*.json ./
RUN npm install --omit=dev --include=optional

COPY . ./

CMD ["node", "--loader", "tsx/esm", "src/main.ts"]
