FROM apify/actor-node:22

WORKDIR /actor
COPY package*.json ./
RUN npm install --omit=dev --include=optional

COPY . ./

CMD ["node", "--import", "tsx", "src/main.ts"]
