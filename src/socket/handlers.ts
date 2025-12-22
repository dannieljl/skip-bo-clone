import { FastifyInstance } from 'fastify';
import { Socket } from 'socket.io';
import { gameManager } from '../session/game-manager.js';
import { CardSource, PlayCardPayload } from '../core/types.js';

interface CustomSocket extends Socket { playerId?: string; }

export function handleSocketEvents(fastify: FastifyInstance, socket: Socket) {
    const s = socket as CustomSocket;

    async function broadcastGameState(gameId: string) {
        const session = gameManager.getGame(gameId);
        if (!session) return;
        const sockets = await fastify.io.in(gameId).fetchSockets();
        sockets.forEach((remoteSocket) => {
            const pid = (remoteSocket as any).playerId;
            if (pid) remoteSocket.emit('game_state', session.getGameState(pid));
        });
    }

    socket.on('create_game', (data: { playerId: string, playerName: string, goalSize: number }) => {
        const session = gameManager.createGame(data.playerId, data.playerName, data.goalSize || 20);
        s.playerId = data.playerId;
        socket.join(session.state.gameId);
        socket.emit('game_state', session.getGameState(data.playerId));
        console.log(`✨ Partida creada: ${session.state.gameId}`);
    });

    socket.on('join_game', async (data: { gameId: string, playerId: string, playerName: string }) => {
        const session = gameManager.getGame(data.gameId);
        if (!session) return socket.emit('error', 'No existe la partida');
        s.playerId = data.playerId;
        socket.join(data.gameId);
        session.join(data.playerId, data.playerName);
        await broadcastGameState(data.gameId);
    });

    socket.on('play_card', async (data: any) => {
        const session = gameManager.getGame(data.gameId);
        if (!session) return;
        const success = session.playCard(data.playerId, {
            cardId: data.cardId,
            source: data.source as CardSource,
            targetIndex: data.targetIndex,
            sourceIndex: data.sourceIndex
        });
        if (success) await broadcastGameState(data.gameId);
        else socket.emit('error', 'Movimiento inválido');
    });

    socket.on('discard_card', async (data: any) => {
        const session = gameManager.getGame(data.gameId);
        if (!session) return;
        if (session.discard(data.playerId, { cardId: data.cardId, targetIndex: data.targetIndex })) {
            await broadcastGameState(data.gameId);
        }
    });

    socket.on('restore_session', async (data: any) => {
        const session = gameManager.getGame(data.gameId);
        if (session && session.isPlayerInGame(data.playerId)) {
            s.playerId = data.playerId;
            socket.join(data.gameId);
            socket.emit('game_state', session.getGameState(data.playerId));
        }
    });
}