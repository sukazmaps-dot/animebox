FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs ./

ENV PORT=9000
ENV PEER_PATH=/peerjs
ENV PEER_KEY=animebox
ENV PEER_PROXIED=true

EXPOSE 9000

CMD ["npm", "start"]
