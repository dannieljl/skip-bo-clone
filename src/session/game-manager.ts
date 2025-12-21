import { GameSession } from './game-session.js';

export class GameManager {
    // Mapa de persistencia en memoria: <gameId, instancia>
    private sessions: Map<string, GameSession> = new Map();

    /**
     * Crea una nueva sesión y la almacena
     */
    public createGame(p1Id: string, p1Name: string, goalSize: number): GameSession {
        const gameId = `game_${Math.random().toString(36).substring(2, 9)}`;
        // Solo pasamos datos de P1
        const newSession = new GameSession(gameId, p1Name, p1Id, goalSize);

        this.sessions.set(gameId, newSession);
        return newSession;
    }

    /**
     * Recupera una sesión activa por su ID
     */
    public getGame(gameId: string): GameSession | undefined {
        return this.sessions.get(gameId);
    }

    /**
     * Elimina la partida cuando termina (limpieza de memoria)
     */
    public removeGame(gameId: string): void {
        this.sessions.delete(gameId);
    }
}

// Exportamos una única instancia (Singleton) para usar en todo el backend
export const gameManager = new GameManager();