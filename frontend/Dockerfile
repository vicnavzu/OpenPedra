FROM node:20-alpine

WORKDIR /app

COPY ./frontend/package*.json ./

RUN npm install --only=production

COPY ./frontend .
COPY ./3dmodels ./3dmodels

EXPOSE 8080

CMD ["node", "server.js"]
