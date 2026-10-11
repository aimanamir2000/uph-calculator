FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
COPY seed ./seed
RUN mkdir /data && chown node:node /data
ENV DATA_DIR=/data PORT=8080 NODE_ENV=production
VOLUME /data
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/library >/dev/null || exit 1
CMD ["node", "server.js"]
