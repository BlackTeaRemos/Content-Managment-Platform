> # Content Management Platform

This project is cleaned up from a personal project and serves as a starting point for building a content management platform with Discord as the interface and Neo4j as the database.

## Configuration

Edit `config/config.json`:

```
{
	"discordToken": "...",
	"discordGuildId": "...",
	"discordCategoryId": "...",
	"logLevel": "info",
	"dataRoot": "./data",
	"mirrorRoot": "./data/mirror",
	"tempRoot": "./data/tmp",
	"neo4j": {
		"uri": "bolt://localhost:7687",
		"username": "neo4j",
		"password": "neo4j",
		"database": "neo4j"
	}
}
```

### docker-compose

`docker-compose.yml` defines a `discord-bot` service:

```
docker compose up --build -d
```

### Development vs Production

Local dev: use `npm test` and `npm run start` (ts-node) for rapid iteration.
Production container: uses `npm run build` during image build and executes `node cmp/index.js`.
