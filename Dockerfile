# Use Node 20 as the base
FROM node:20

# Install sqlite3 dependencies
RUN apt-get update && apt-get install -y sqlite3 python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm_config_build_from_source=true npm install

# Copy the rest of the app
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PRISM_DB_PATH=/app/data/prism.db

# Build the Next.js app
RUN npm run build

# Create data directory for persistence
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["npm", "start"]
