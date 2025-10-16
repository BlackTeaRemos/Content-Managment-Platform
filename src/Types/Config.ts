import type { Neo4jConfig } from '../Repository/Neo4jClient.js';

/**
 * Validated configuration shape used across services.
 */
export interface ValidatedConfig {
    discordToken: string;
    discordGuildId: string;
    discordCategoryId: string;
    logLevel?: `debug` | `info` | `warn` | `error`;
    dataRoot?: string;
    mirrorRoot?: string;
    tempRoot?: string;
    neo4j: Neo4jConfig;
}
