import { Game } from './Create.js';

/**
 * State for interactive game creation per user
 */
export interface GameCreationState {
    serverId: string;
    gameName?: string;
}

/**
 * Map of userId to state
 */
export const gameCreationStates = new Map<string, GameCreationState>();
