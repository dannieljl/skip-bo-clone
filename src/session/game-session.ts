import { GameState, PlayerState, Card, PlayCardPayload, DiscardCardPayload } from '../core/types.js';
import { Deck } from '../core/deck.js';
import { SkipBoEngine } from '../core/engine.js';

export class GameSession {
    private deck: Deck;
    private state: GameState;
    private readonly initialGoalSize: number;

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
        };
    }

    public join(p2Id: string, p2Name: string): void {
        if (this.state.opponent) return;

        this.state.opponent = this.initPlayer(p2Id, p2Name);
        this.state.status = 'playing';
        this.setupInitialGame();
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

        // 2. Validación de existencia (Type Guard para evitar TS2345)
        if (!card || card.id !== payload.cardId) return false;

        // 3. Validar reglas de Skip-Bo con el Engine
        if (SkipBoEngine.isValidMove(targetPile, card)) {

            // 4. Ejecutar el movimiento (Quitar de origen)
            if (payload.source === 'hand') {
                player.hand.splice(cardIdx, 1);
            } else if (payload.source === 'goal') {
                player.goalPile.pop();
                player.goalRemaining = player.goalPile.length;
                if (player.goalRemaining === 0) this.state.status = 'finished';
            } else if (payload.source === 'discard' && typeof payload.sourceIndex === 'number') {
                player.discards[payload.sourceIndex]?.pop();
            }

            // 5. Poner en destino
            targetPile.push(card);

            // 6. Limpiar si la pila llega a 12
            if (SkipBoEngine.isPileComplete(targetPile)) {
                // 1. Mandar la pila al mazo (se encarga de acumular 3)
                this.deck.pushToPending(targetPile);

                // 2. Vaciar la pila de la mesa
                this.state.commonPiles[payload.targetIndex] = [];

                // 3. Actualizar contadores del estado
                this.state.drawPileCount = this.deck.count;
                this.state.pilesToRecycleCount = this.deck.pendingCount;
            }

            // 7. Rellenar mano si quedó vacía (Regla: roba 5 nuevas)
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

        // Validaciones básicas
        if (cardIdx === -1 || payload.targetIndex < 0 || payload.targetIndex > 3) return false;

        const targetSlot = player.discards[payload.targetIndex];
        if (!targetSlot) return false; // Evita TS2532

        // Extraer carta de forma segura para evitar TS2345
        const extracted = player.hand.splice(cardIdx, 1);
        const cardToDiscard = extracted[0];

        if (!cardToDiscard) return false;

        // Realizar el descarte
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
            opponent: opponent ? {
                ...opponent,
                // 1. Ocultamos la mano completa (siempre es secreta)
                hand: Array(opponent.hand.length).fill(null),

                // 2. Mantenemos la longitud de la Goal Pile, pero solo revelamos la última carta
                goalPile: opponent.goalPile.map((card, index) => {
                    // Si es la última carta de la pila, la enviamos real; si no, mandamos null
                    return index === opponent.goalPile.length - 1 ? card : null;
                })
            } : null as any
        };
    }
}