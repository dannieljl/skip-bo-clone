import { FastifyInstance } from 'fastify';
import { Socket } from 'socket.io';
import { gameManager } from '../session/game-manager.js';
import { CardSource, PlayCardPayload } from '../core/types.js';

/**
 * Definimos interfaces locales para los eventos para evitar el error TS2339
 */
interface GameEventBase {
    gameId: string;
    playerId: string;
}

interface CustomSocket extends Socket {
    playerId?: string;
}

export function handleSocketEvents(fastify: FastifyInstance, socket: Socket) {
    const s = socket as CustomSocket;
    /**
     * Envía el estado personalizado a cada jugador en la sala.
     */
    async function broadcastGameState(gameId: string) {
        const session = gameManager.getGame(gameId);
        if (!session) return;

        const sockets = await fastify.io.in(gameId).fetchSockets();

        sockets.forEach((remoteSocket) => {
            // Recuperamos el playerId que guardamos en el socket al conectar/unirse
            const pid = (remoteSocket as any).playerId;
            if (pid) {
                const personalizedState = session.getGameState(pid);
                remoteSocket.emit('game_state', personalizedState);
            }
        });
    }

    // 1. CREAR PARTIDA
    socket.on('create_game', (data: { playerId: string, playerName: string, goalSize: number }) => {
        const session = gameManager.createGame(
            data.playerId,
            data.playerName,
            data.goalSize || 20
        );

        // Obtenemos el estado para sacar el gameId real
        const initialState = session.getGameState(data.playerId);
        const gameId = initialState.gameId;

        // IMPORTANTE: Vincular el playerId al objeto socket actual
        (socket as any).playerId = data.playerId;

        socket.join(gameId);
        socket.emit('game_state', initialState);
        console.log(`✨ Game created: ${gameId} by ${data.playerName}`);
    });

    // 2. UNIRSE A PARTIDA
    socket.on('join_game', async (data: { gameId: string, playerId: string, playerName: string }) => {
        const session = gameManager.getGame(data.gameId);

        if (!session) {
            return socket.emit('error', { message: 'Game not found' });
        }

        (socket as any).playerId = data.playerId;
        socket.join(data.gameId);

        // El método join de session ahora maneja reconexiones internamente
        session.join(data.playerId, data.playerName);

        await broadcastGameState(data.gameId);
    });

    // 3. JUGAR CARTA
    socket.on('play_card', async (data: GameEventBase & {
        cardId: string,
        source: string,
        targetIndex: number,
        sourceIndex?: number
    }) => {
        const session = gameManager.getGame(data.gameId);
        if (!session) return;

        const payload: PlayCardPayload = {
            cardId: data.cardId,
            source: data.source as CardSource,
            targetIndex: data.targetIndex,
        };

        if (typeof data.sourceIndex === 'number') {
            payload.sourceIndex = data.sourceIndex;
        }

        // Usamos data.playerId persistente para validar el turno, NO socket.id
        const success = session.playCard(data.playerId, payload);

        if (success) {
            await broadcastGameState(data.gameId);
        } else {
            socket.emit('error', { message: 'Invalid move' });
        }
    });

    // 4. DESCARTAR
    socket.on('discard_card', async (data: GameEventBase & { cardId: string, targetIndex: number }) => {
        const session = gameManager.getGame(data.gameId);
        if (!session) return;

        const success = session.discard(data.playerId, {
            cardId: data.cardId,
            targetIndex: data.targetIndex
        });

        if (success) {
            await broadcastGameState(data.gameId);
        }
    });

    // 5. RESTAURAR SESIÓN (Crucial para móviles)
    socket.on('restore_session', async (data: GameEventBase) => {
        const session = gameManager.getGame(data.gameId);

        if (session && session.isPlayerInGame(data.playerId)) {
            (socket as any).playerId = data.playerId;
            socket.join(data.gameId);

            // Actualizamos la sesión con el nuevo ID de socket si fuera necesario
            session.join(data.playerId, "Player");

            const state = session.getGameState(data.playerId);
            socket.emit('game_state', state);

            // Refrescamos a ambos para asegurar sincronía tras reconexión
            await broadcastGameState(data.gameId);
            console.log(`🔄 Session restored for ${data.playerId} in ${data.gameId}`);
        } else {
            socket.emit('session_expired');
        }
    });
}