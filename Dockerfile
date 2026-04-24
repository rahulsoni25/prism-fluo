FROM ghcr.io/railwayapp/nixpacks:ubuntu-1745885067

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package.json package-lock.json ./

# Install dependencies — npm cache is redirected to /tmp via .npmrc
# so there is no interaction with any mounted directory under node_modules
RUN npm ci

# Copy the rest of the source
COPY . .

# Build Next.js.
# Intentionally NO --mount=type=cache,target=/app/node_modules/.cache here.
# That mount is what causes "EBUSY: resource busy or locked, rmdir
# '/app/node_modules/.cache'" during the Railway/Nixpacks build.
# The webpack cache is already redirected to /tmp/next-webpack-cache via
# next.config.mjs, so we lose nothing meaningful by dropping the mount.
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    npm run build

# Initialise the database schema then start the Next.js server
CMD ["sh", "-c", "node scripts/init_db.mjs && npm start"]
