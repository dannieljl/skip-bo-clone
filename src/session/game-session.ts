import { GameState, PlayerState, Card, PlayCardPayload, DiscardCardPayload } from '../core/types.js';
import { Deck } from '../core/deck.js';
import { SkipBoEngine } from '../core/engine.js';

export class GameSession {
    private deck: Deck;
    private state: GameState;
    private readonly initialGoalSize: number;
    private playerSockets: Map<string, string> = new Map(); // <playerId, socketId>


    constructor(gameId: string, p1Name: string, p1Id: string, goalPileSize: number = 20) {
        this.deck = new Deck();
        this.initialGoalSize = goalPileSize;

        const p1 = this.initPlayer(p1Id, p1Name);

        this.state = {
            gameId,
            currentPlayerId: p1Id,
            status: 'waiting',
            commonPiles: [[], [], [], []],
            me: p1,
            opponent: null as any,
            drawPileCount: 0,
            pilesToRecycleCount: 0,
            winnerId: undefined // Inicializado como undefined
        };
    }


    /**
     * Gestiona la entrada de jugadores a la sesión.
     * Soporta reconexiones automáticas detectando si el playerId ya existe.
     */
    public join(playerId: string, playerName: string): void {

        console.log('--- [DEBUG JOIN] ---');
        console.log(`Llega ID: "${playerId}"`);
        console.log(`ID Creador (Me): "${this.state.me.id}"`);
        console.log(`¿Son idénticos?: ${this.state.me.id === playerId}`);


        // Caso 1: El Creador (Jugador 1) se está reconectando
        if (this.state.me.id === playerId) {
            console.log(`✅ MATCH: Oponente ${playerName} reconectado.`);
            // Actualizamos el nombre por si decidió cambiarlo al volver
            this.state.me.name = playerName;

            // Si el juego estaba en pausa o esperando, podrías cambiar el status aquí
            // pero generalmente el status se mantiene en 'playing' o 'waiting'
            return;
        }

        // Caso 2: El Oponente (Jugador 2) ya existía y se está reconectando
        if (this.state.opponent && this.state.opponent.id === playerId) {
            console.log(`✅ MATCH: Oponente ${playerName} reconectado.`);
            // Actualizamos el nombre por si acaso
            this.state.opponent.name = playerName;
            return;
        }

        // Caso 3: Es un nuevo jugador intentando unirse como oponente
        if (!this.state.opponent) {
            console.log(`🚀 NO MATCH: Iniciando juego para nuevo oponente: ${playerName}`);
            this.state.opponent = this.initPlayer(playerId, playerName);
            this.state.status = 'playing';
            this.setupInitialGame();
            return;
        }

        // Caso 4: La partida ya está llena (intento de un tercer jugador)
        if (this.state.me.id !== playerId && this.state.opponent.id !== playerId) {
            console.warn(`[Session] Access denied: Game ${this.state.gameId} is already full.`);
            // Aquí podrías lanzar un error o manejarlo en el handler
        }
    }

    /**
     * Método auxiliar para verificar si un jugador pertenece a esta sesión
     * (Útil para el handler de restore_session)
     */
    public isPlayerInGame(playerId: string): boolean {
        const isMe = this.state.me && this.state.me.id === playerId;
        const isOpponent = this.state.opponent && this.state.opponent.id === playerId;
        return isMe || isOpponent;
    }


    private initPlayer(id: string, name: string): PlayerState {
        return {
            id, name,
            hand: [],
            goalPile: [],
            goalRemaining: 0,
            discards: [[], [], [], []]
        };
    }

    private setupInitialGame(): void {
        this.state.me.goalPile = this.deck.draw(this.initialGoalSize);
        this.state.me.goalRemaining = this.state.me.goalPile.length;

        this.state.opponent.goalPile = this.deck.draw(this.initialGoalSize);
        this.state.opponent.goalRemaining = this.state.opponent.goalPile.length;

        this.state.me.hand = this.deck.draw(5);
        this.state.opponent.hand = this.deck.draw(5);

        this.state.drawPileCount = this.deck.count;
    }

    public playCard(playerId: string, payload: PlayCardPayload): boolean {
        // No permitir jugadas si el juego ya terminó o no es el turno
        if (this.state.currentPlayerId !== playerId || this.state.status !== 'playing') return false;

        const player = this.state.me.id === playerId ? this.state.me : this.state.opponent;
        const targetPile = this.state.commonPiles[payload.targetIndex];

        if (!targetPile) return false;

        let card: Card | undefined;
        let cardIdx = -1;

        // 1. Localizar la carta según el origen
        if (payload.source === 'hand') {
            cardIdx = player.hand.findIndex(c => c.id === payload.cardId);
            card = player.hand[cardIdx];
        } else if (payload.source === 'goal') {
            card = player.goalPile[player.goalPile.length - 1];
        } else if (payload.source === 'discard' && typeof payload.sourceIndex === 'number') {
            const slot = player.discards[payload.sourceIndex];
            if (slot && slot.length > 0) {
                card = slot[slot.length - 1];
            }
        }

        // 2. Validación de existencia
        if (!card || card.id !== payload.cardId) return false;

        // 3. Validar reglas de Skip-Bo con el Engine
        if (SkipBoEngine.isValidMove(targetPile, card)) {

            // 4. Ejecutar el movimiento (Quitar de origen)
            if (payload.source === 'hand') {
                player.hand.splice(cardIdx, 1);
            } else if (payload.source === 'goal') {
                player.goalPile.pop();
                player.goalRemaining = player.goalPile.length;

                // --- LÓGICA DE VICTORIA ---
                if (player.goalRemaining === 0) {
                    this.state.status = 'finished';
                    this.state.winnerId = playerId;
                }
            } else if (payload.source === 'discard' && typeof payload.sourceIndex === 'number') {
                player.discards[payload.sourceIndex]?.pop();
            }

            // 5. Poner en destino
            targetPile.push(card);

            // 6. Limpiar si la pila llega a 12
            if (SkipBoEngine.isPileComplete(targetPile)) {
                this.deck.pushToPending(targetPile);
                this.state.commonPiles[payload.targetIndex] = [];
                this.state.drawPileCount = this.deck.count;
                this.state.pilesToRecycleCount = this.deck.pendingCount;
            }

            // 7. Rellenar mano si quedó vacía (solo si el juego sigue activo)
            if (player.hand.length === 0 && this.state.status === 'playing') {
                player.hand = this.deck.draw(5);
            }

            this.state.drawPileCount = this.deck.count;
            return true;
        }
        return false;
    }

    public discard(playerId: string, payload: DiscardCardPayload): boolean {
        if (this.state.currentPlayerId !== playerId || this.state.status !== 'playing') return false;

        const player = this.state.me.id === playerId ? this.state.me : this.state.opponent;
        const cardIdx = player.hand.findIndex(c => c.id === payload.cardId);

        if (cardIdx === -1 || payload.targetIndex < 0 || payload.targetIndex > 3) return false;

        const targetSlot = player.discards[payload.targetIndex];
        if (!targetSlot) return false;

        const extracted = player.hand.splice(cardIdx, 1);
        const cardToDiscard = extracted[0];

        if (!cardToDiscard) return false;

        targetSlot.push(cardToDiscard);

        // --- CAMBIO DE TURNO ---
        this.state.currentPlayerId = (this.state.me.id === playerId)
            ? this.state.opponent.id
            : this.state.me.id;

        // --- REPARTO AL SIGUIENTE JUGADOR ---
        const nextPlayer = this.state.currentPlayerId === this.state.me.id
            ? this.state.me
            : this.state.opponent;

        if (nextPlayer.hand.length < 5) {
            const toDraw = 5 - nextPlayer.hand.length;
            nextPlayer.hand.push(...this.deck.draw(toDraw));
        }

        this.state.drawPileCount = this.deck.count;
        return true;
    }

    public getGameState(requestingPlayerId: string): GameState {
        const isPlayer1 = this.state.me.id === requestingPlayerId;
        const me = isPlayer1 ? this.state.me : this.state.opponent;
        const opponent = isPlayer1 ? this.state.opponent : this.state.me;

        return {
            gameId: this.state.gameId,
            currentPlayerId: this.state.currentPlayerId,
            status: this.state.status,
            commonPiles: this.state.commonPiles,
            me: me,
            pilesToRecycleCount: this.deck.pendingCount,
            drawPileCount: this.deck.count,
            winnerId: this.state.winnerId, // Se envía el ganador o undefined
            opponent: opponent ? {
                ...opponent,
                hand: Array(opponent.hand.length).fill(null),
                goalPile: opponent.goalPile.map((card, index) => {
                    return index === opponent.goalPile.length - 1 ? card : null;
                })
            } : null as any
        };
    }
}