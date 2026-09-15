FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates ffmpeg imagemagick webp \
    && test -x /usr/bin/git \
    && /usr/bin/git --version \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY .npmrc ./

RUN /usr/bin/git --version \
    && npm --version \
    && npm install --omit=dev --legacy-peer-deps

COPY . .

EXPOSE 3000

CMD ["npm", "run", "pairing"]
