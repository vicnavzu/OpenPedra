FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

RUN pip install poetry
RUN poetry config virtualenvs.create false

COPY ./backend/pyproject.toml ./backend/poetry.lock* ./

RUN poetry install --without dev --no-interaction --no-ansi --no-root

COPY ./backend .
COPY ./3dmodels ./3dmodels

RUN chmod +x entrypoint.sh
RUN chmod +x check_connection.py

EXPOSE 10000

CMD ["./entrypoint.sh"]