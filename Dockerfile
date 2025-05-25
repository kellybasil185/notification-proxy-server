# Dockerfile

# 1. Base Image with Node.js
FROM node:18-slim AS base
WORKDIR /usr/src/app

# 2. Install Python and pip
RUN apt-get update && apt-get install -y python3 python3-pip wget && rm -rf /var/lib/apt/lists/*

# 3. Copy package.json and package-lock.json (if available)
COPY package*.json ./

# 4. Install Node.js dependencies
RUN npm install --production

# 5. Copy Python requirements file
COPY requirements.txt ./

# 6. Install Python dependencies
RUN pip3 install --no-cache-dir -r requirements.txt

# 7. Copy the rest of your application code
COPY . .

# 8. Install PM2 globally
RUN npm install -g pm2

# 9. Expose the port your Node.js server will run on
EXPOSE 3001 
# Note: Render will automatically use process.env.PORT, so your Node.js app should respect that.
# Your server.js already does: const PORT = process.env.PORT || 3001; which is good.

# 10. Command to run your application using PM2
# This will start both processes defined in ecosystem.config.js
CMD [ "pm2-runtime", "start", "ecosystem.config.js" ]