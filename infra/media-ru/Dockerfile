FROM node:22-alpine

WORKDIR /app
COPY server.mjs ./server.mjs

ENV NODE_ENV=production
ENV PORT=8788
ENV CACHE_DIR=/data/posters

RUN mkdir -p /data/posters

VOLUME ["/data/posters"]
EXPOSE 8788

CMD ["node", "server.mjs"]
