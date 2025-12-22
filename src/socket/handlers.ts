import { FastifyInstance } from 'fastify';
import { Socket } from 'socket.io';
import { gameManager } from '../session/game-manager.js';
import {CardSource, PlayCardPayload} from '../core/types.js'; // Asegúrate de importar esto

export function handleSocketEvents(fastify: FastifyInstance, socket: Socket) {

    async function broadcastGameState(gameId: string) {
        const session = gameManager.getGame(gameId);
        if (!session) return;

        const sockets = await fastify.io.in(gameId).fetchSockets();

        sockets.forEach((s) => {
            const personalizedState = session.getGameState(s.id);
            s.emit('game_state', personalizedState);
        });
    }

    // 1. CREAR PARTIDA
    socket.on('create_game', (data: { playerId: string, playerName: string, goalSize: number }) => {
        const session = gameManager.createGame(
            data.playerId,
            data.playerName,
            data.goalSize || 20
        );

        const gameId = session.getGameState(socket.id).gameId;
        socket.join(gameId);
        socket.emit('game_state', session.getGameState(socket.id));

    });

    // 2. UNIRSE A PARTIDA
    socket.on('join_game', async (data: { gameId: string, playerId: string, playerName: string }) => {
        const session = gameManager.getGame(data.gameId);

        if (!session) {
            return socket.emit('error', { message: 'Partida no encontrada' });
        }

        socket.join(data.gameId);
        session.join(data.playerId, data.playerName);

        await broadcastGameState(data.playerId);
        console.log(`👤 ${data.playerName} se unió`);
    });

    // 3. JUGAR CARTA (CORREGIDO)
    // handlers.ts

    socket.on('play_card', async (data: {
        gameId: string,
        cardId: string,
        source: string,
        targetIndex: number,
        sourceIndex?: number
    }) => {
        const session = gameManager.getGame(data.gameId);
        if (!session) return;

        // Construimos el payload dinámicamente para cumplir con 'exactOptionalPropertyTypes'
        const payload: PlayCardPayload = {
            cardId: data.cardId,
            source: data.source as CardSource,
            targetIndex: data.targetIndex,
        };

        // Solo agregamos sourceIndex si es un número (evitamos pasar undefined)
        if (typeof data.sourceIndex === 'number') {
            payload.sourceIndex = data.sourceIndex;
        }

        const success = session.playCard(socket.id, payload);

        if (success) {
            await broadcastGameState(data.gameId);
        } else {
            socket.emit('error', { message: 'Movimiento inválido' });
        }
    });

    // 4. DESCARTAR
    socket.on('discard_card', async (data: { gameId: string, cardId: string, targetIndex: number }) => {
        const session = gameManager.getGame(data.gameId);
        if (!session) return;

        const success = session.discard(socket.id, {
            cardId: data.cardId,
            targetIndex: data.targetIndex
        });

        if (success) {
            await broadcastGameState(data.gameId);
        }
    });
}