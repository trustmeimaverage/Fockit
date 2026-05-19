# Build frontend
FROM node:20-alpine as build
WORKDIR /app
COPY client/package*.json ./client/
RUN cd client && npm install
COPY client/ ./client/
RUN cd client && npm run build

# Setup Python backend
FROM python:3.12-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y libpq-dev gcc && rm -rf /var/lib/apt/lists/*

COPY server/requirements.txt ./server/
RUN cd server && pip install --no-cache-dir -r requirements.txt

# Copy built frontend
COPY --from=build /app/client/dist ./client/dist

# Copy backend code
COPY server/ ./server/

EXPOSE 3001
ENV PYTHONUNBUFFERED=1

WORKDIR /app/server
CMD ["uvicorn", "fockit_project.asgi:application", "--host", "0.0.0.0", "--port", "3001"]
