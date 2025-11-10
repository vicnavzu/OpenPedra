#!/bin/sh
set -e

echo "Starting application"
echo "PORT: $PORT"

if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL not configured"
    exit 1
fi

echo "Waiting for database to be ready..."
until python check_connection.py; do
  echo "Database not available, retrying in 2 seconds..."
  sleep 2
done

echo "Running migrations..."
poetry run alembic upgrade head

echo "Starting FastAPI server..."
if [ "$RELOAD" = "true" ]; then
    echo "Starting in DEVELOPMENT mode with hot reload..."
    exec poetry run uvicorn app.main:app --host 0.0.0.0 --port $PORT --reload --reload-dir /app
else
    echo "Starting in PRODUCTION mode..."
    exec poetry run gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120
fi