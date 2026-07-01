# QuoteBot architecture

This project is split into three parts:

- `bot` in [app.js](app.js) handles Discord interactions only and runs as a normal Node process.
- `api` in [quotesAPI/main.py](quotesAPI/main.py) owns the FastAPI endpoints and database access.
- `db` is owned by the API side, not the bot.

The bot never talks to Postgres directly. It calls the API over HTTP using `API_BASE_URL`.

## Endpoints

The API currently exposes:

- `GET /health`
- `GET /quotes`
- `GET /quotes/{quote_id}`
- `GET /quotes/random`
- `POST /quotes`
- `DELETE /quotes/{quote_id}`

## Local setup

1. Copy `.env.sample` to `.env` and fill in your Discord credentials.
2. Start the API separately at `http://localhost:8000`.
3. Run `npm start` for the bot.
4. Expose the bot on port `3000` with `ngrok http 3000` if you are using Discord interactions locally.

The API will be available on port `8000` for direct testing.

## Discord commands

The bot currently registers:

- `/quote` — get a random quote from this server
- `/searchquote <query>` — search quotes in this server
- `/addquote` — create a multi-line quote via modal (staff only)
- `/editquote <quote_id>` — edit a quote by ID via modal (staff only)
- `/deletequote <quote_id>` — delete a quote by ID (staff only)
- `/latestquotes` — show the latest 5 quotes from this server
- `/listquotes [page]` — list quotes from this server, paginated at 5 per page
- `/ping` — check if the bot and API are responsive
