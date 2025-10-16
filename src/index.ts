/**
 * Main entry point for the application. Boots up the app and orchestrates startup routines.
 */

import { DiscordApp } from './App.js';
import { setupNeo4j } from './Setup/Neo4j.js';

async function main() {
    try {
        // Initialize Neo4j and register it with the container
        await setupNeo4j();

        // Start the application
        const app = new DiscordApp();
        await app.Start();
    } catch(err) {
        console.error(`Fatal error during application startup:`, err);
        process.exit(1);
    }
}

main();
