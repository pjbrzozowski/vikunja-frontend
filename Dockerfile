# Stage 1: Build application
FROM node:18-alpine AS compile-image

WORKDIR /build

ARG USE_RELEASE=false
ARG RELEASE_VERSION=main

ENV PNPM_CACHE_FOLDER .cache/pnpm/
ADD .  ./

RUN \
  if [ $USE_RELEASE = true ]; then \
    wget https://dl.vikunja.io/frontend/vikunja-frontend-$RELEASE_VERSION.zip -O frontend-release.zip && \
    unzip frontend-release.zip -d dist/ && \
    exit 0; \
  fi && \
  # https://pnpm.io/installation#using-corepack
  corepack enable && \
  # we don't use corepack prepare here by intend since
  # we have renovate to keep our dependencies up to date
  # Build the frontend
  pnpm install && \
  apk add --no-cache git && \
  echo '{"VERSION": "'$(git describe --tags --always --abbrev=10 | sed 's/-/+/' | sed 's/^v//' | sed 's/-g/-/')'"}' > src/version.json && \
  pnpm run build

# Stage 2: copy 
FROM nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf
RUN chmod 777 /usr/share/nginx/html && chmod 666 /usr/share/nginx/html/index.html

COPY run.sh /run.sh

# copy compiled files from stage 1
COPY --from=compile-image /build/dist /usr/share/nginx/html

LABEL maintainer="maintainers@vikunja.io"

RUN apk add --no-cache \
  # for sh file
	bash \
	# installs usermod and groupmod
	shadow

CMD "/run.sh"
