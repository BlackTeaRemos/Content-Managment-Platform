// Removed Sapphire container; using direct assignment
import { Neo4jClient, type Neo4jConfig } from '../Repository/Neo4jClient.js';
import { ConfigService } from '../Services/ConfigService.js';
import { MAIN_EVENT_BUS } from '../Events/MainEventBus.js';

/**
 * Initializes the Neo4jClient and registers it with the Sapphire container.
 * This allows any part of the application to access the Neo4j client via `container.neo4j`.
 */
export let neo4jClient: Neo4jClient;
export async function setupNeo4j() {
    const configService = new ConfigService(MAIN_EVENT_BUS);
    const configPath = process.env.CONFIG_PATH || './config/config.json';
    const appConfig = await configService.Load(configPath);

    const neo4jConfig: Neo4jConfig = {
        uri: appConfig.neo4j.uri,
        username: appConfig.neo4j.username,
        password: appConfig.neo4j.password,
        database: appConfig.neo4j.database,
    };

    neo4jClient = new Neo4jClient(neo4jConfig);
    await neo4jClient.Init();

    console.log('Neo4j client initialized and connected.');
}
