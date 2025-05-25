# Dockerfile

# 1. Base Image with Node.js
FROM node:18-slim AS base
WORKDIR /usr/src/app

# 2. Install Python, pip, and python3-venv
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

# 3. Create a Python virtual environment
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH" # Add venv's bin to the PATH

# 4. Copy package.json and package-lock.json (if available)
COPY package*.json ./

# 5. Install Node.js dependencies
RUN npm install --production

# 6. Copy Python requirements file
COPY requirements.txt ./

# 7. Install Python dependencies (now using the virtual environment's pip)
RUN pip install --no-cache-dir -r requirements.txt # No need for pip3 if venv is activated

# 8. Copy the rest of your application code
COPY . .

# 9. Install PM2 globally
RUN npm install -g pm2

# 10. Expose the port your Node.js server will run on
EXPOSE 3001 

# 11. Command to run your application using PM2
CMD [ "pm2-runtime", "start", "ecosystem.config.js" ]