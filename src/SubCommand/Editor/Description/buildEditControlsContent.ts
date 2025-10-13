export function buildEditControlsContent(state: any): string {
    const mode = state.editMode ?? 'replace';
    const awaiting = state.awaitingFile ? 'Waiting for file upload...' : '';
    return `Mode: ${mode}. ${awaiting}`;
}
