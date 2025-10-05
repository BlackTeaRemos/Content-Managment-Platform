/**
 * Handles the 'messageCreate' event from Discord, processing new incoming messages.
 */
import type { Message } from 'discord.js';
import { log } from '../Common/Log.js';
import { flowManager } from '../Common/Flow/Manager.js';

/**
 * Handles the messageCreate event, forwarding relevant messages to the flow manager.
 * @param message Message Discord message instance emitted by the gateway. Example text message in a guild channel.
 * @returns Promise<void> Resolves once flow processing is complete. Example await onMessageCreate(message).
 * @example
 * client.on('messageCreate', onMessageCreate);
 */
export async function onMessageCreate(message: Message): Promise<void> {
    // Passive-aggressive commentary for empty messages
    if (!message.content && message.attachments.size === 0 && message.embeds.length === 0) {
        log.info('...Wow, an empty message. Inspiring.', 'Message');
    } else {
        log.info(`Message from ${message.author.tag}: ${message.content}`, 'Message');
    }
    // Delegate to flow manager for any active user flows expecting message input
    try {
        await flowManager.onMessage(message);
    } catch (error) {
        log.error(`Flow manager failed to process message ${message.id}: ${(error as Error).message}`, 'Flow');
    }
}
