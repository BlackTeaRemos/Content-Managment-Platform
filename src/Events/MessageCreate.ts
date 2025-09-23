/**
 * Handles the 'messageCreate' event from Discord, processing new incoming messages.
 */
import type { Message } from 'discord.js';
import { log } from '../Common/Log.js';

/**
 * Handles the messageCreate event.
 * @param message Message - The Discord.js message instance
 */
export async function onMessageCreate(message: Message): Promise<void> {
    // Passive-aggressive commentary for empty messages
    if (!message.content && message.attachments.size === 0 && message.embeds.length === 0) {
        log.info('...Wow, an empty message. Inspiring.', 'Message');
    } else {
        log.info(`Message from ${message.author.tag}: ${message.content}`, 'Message');
    }
    // Game creation: collect image after name set
    try {
        const { gameCreationStates } = await import('../Flow/Object/Game/Flow.js');
        const state = gameCreationStates.get(message.author.id);
        if (state && state.gameName) {
            // Expect an attachment
            const attachment = message.attachments.first();
            if (!attachment) {
                await message.reply('Please send an image attachment to set as the game image.');
                return;
            }
            // Download attachment
            const response = await fetch(attachment.url);
            const buffer = await response.arrayBuffer();
            const blobBuffer = Buffer.from(buffer);
            // Upload to MinIO
            const { uploadGameImage } = await import('../Flow/Object/Game/Upload.js');
            const objectName = `${message.author.id}_${Date.now()}_${attachment.name}`;
            const imageUrl = await uploadGameImage(
                'game-images',
                objectName,
                blobBuffer,
                attachment.contentType || 'application/octet-stream',
            );
            // Create game in DB
            const { createGame } = await import('../Flow/Object/Game/Create.js');
            const newGame = await createGame(state.gameName, imageUrl, state.serverId);
            // Notify user
            // Send confirmation to user
            await message.reply(`Game ${newGame.uid} '${newGame.name}' created on server ${newGame.serverId}.`);
            // Clear state
            gameCreationStates.delete(message.author.id);
        }
    } catch (err) {
        log.error(`Error in game creation flow: ${err}`, 'GameFlow');
    }
}
