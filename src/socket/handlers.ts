import { FastifyInstance } from 'fastify';
import { Socket } from 'socket.io';
import { gameManager } from '../session/game-manager.js';
import { CardSource } from '../core/types.js';

interface CustomSocket extends Socket { playerId?: string; }

export function handleSocketEvents(fastify: FastifyInstance, socket: Socket) {
    const s = socket as CustomSocket;

    async function broadcastGameState(gameId: string) {
        const session = gameManager.getGame(gameId);
        if (!session) return;
        const sockets = await fastify.io.in(gameId).fetchSockets();
        sockets.forEach((remoteSocket) => {
            const pid = (remoteSocket as any).playerId;
            if (pid) {
                remoteSocket.emit('game_state', session.getGameState(pid));
            }
        });
    }

    socket.on('create_game', (data: { playerId: string, playerName: string, goalSize: number }) => {
        const session = gameManager.createGame(data.playerId, data.playerName, data.goalSize || 20);
        s.playerId = data.playerId;
        socket.join(session.state.gameId);
        socket.emit('game_state', session.getGameState(data.playerId));
        console.log(`✨ Partida Creada en Servidor: ${session.state.gameId}`);
    });

    socket.on('join_game', async (data: { gameId: string, playerId: string, playerName: string }) => {
        const session = gameManager.getGame(data.gameId);
        if (!session) {
            console.log(`⚠️ Intento de unión a partida inexistente: ${data.gameId}`);
            return socket.emit('error', 'No existe la partida o ya ha terminado.');
        }

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
        else socket.emit('error', 'Movimiento no permitido');
    });

    socket.on('discard_card', async (data: any) => {
        const session = gameManager.getGame(data.gameId);
        if (!session) return;

        if (session.discard(data.playerId, { cardId: data.cardId, targetIndex: data.targetIndex })) {
            await broadcastGameState(data.gameId);
        }
    });

    // NUEVO EVENTO
    socket.on('rps_choice', async (data: { gameId: string, playerId: string, choice: 'rock'|'paper'|'scissors' }) => {
        const session = gameManager.getGame(data.gameId);
        if (!session) return;

        const result = session.playRPS(data.playerId, data.choice);

        if (result) {
            // 1. Emitir estado inmediato (Muestra elección o resultado 'Draw'/'Win')
            await broadcastGameState(data.gameId);

            // 2. Si hubo resultado (Draw o Win), esperamos y luego avanzamos
            if (result !== 'continue') {
                setTimeout(async () => {
                    if (result === 'draw') {
                        // Reseteamos para nueva ronda
                        session.resetRPSRound();
                        // 📢 IMPORTANTE: Avisamos a todos que se reseteó
                        await broadcastGameState(data.gameId);
                    } else {
                        // Finalizamos e iniciamos partida
                        session.finalizeRPS();
                        // 📢 IMPORTANTE: Avisamos que el juego empezó
                        await broadcastGameState(data.gameId);
                    }
                }, 3000); // 3 segundos para ver la animación
            }
        }

    });

    socket.on('disconnect', () => {
        if (s.playerId) {
            console.log(`🔌 Cliente desconectado del socket: ${socket.id} (Jugador ID: ${s.playerId})`);
        }
    });

}