import { GameState, PlayerState, Card, PlayCardPayload, DiscardCardPayload } from '../core/types.js';
import { Deck } from '../core/deck.js';
import { SkipBoEngine } from '../core/engine.js';

export class GameSession {
    private deck: Deck;
    public state: GameState;
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
            winnerId: undefined
        };
    }

    public join(playerId: string, playerName: string): void {
        console.log(`[Session] Intento de unión: ${playerName} (${playerId})`);

        // Caso 1: El Creador (P1) se está reconectando
        if (this.state.me.id === playerId) {
            console.log(`[Session] Dueño (P1) regresó. Esperando oponente...`); this.state.me.name = playerName;
            return;
        }

        // Caso 2: El Oponente (P2) ya existía y se reconecta
        if (this.state.opponent && this.state.opponent.id === playerId) {
            console.log(`[Session] Oponente (P2) regresó.`);
            this.state.opponent.name = playerName;
            return;
        }

        // Caso 3: Es un nuevo oponente y la partida está esperando (Candado de inicio)
        if (!this.state.opponent && this.state.status === 'waiting') {
            console.log(`[Session] ¡Oponente detectado! Repartiendo cartas...`);
            this.state.opponent = this.initPlayer(playerId, playerName);
            this.state.status = 'playing';
            this.setupInitialGame();
            return;
        }

        console.warn(`[Session] Petición de unión ignorada. Status: ${this.state.status}`);
    }

    public isPlayerInGame(playerId: string): boolean {
        const isP1 = this.state.me && this.state.me.id === playerId;
        const isP2 = this.state.opponent && this.state.opponent.id === playerId;
        return !!(isP1 || isP2);
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

        // Verificación TS: Existe el montón destino
        if (!targetPile) return false;

        let card: Card | undefined;
        let cardIdx = -1;

        // Selección de carta según origen
        if (payload.source === 'hand') {
            cardIdx = player.hand.findIndex(c => c.id === payload.cardId);
            if (cardIdx !== -1) card = player.hand[cardIdx];
        } else if (payload.source === 'goal') {
            card = player.goalPile[player.goalPile.length - 1];
        } else if (payload.source === 'discard' && typeof payload.sourceIndex === 'number') {
            const slot = player.discards[payload.sourceIndex];
            if (slot && slot.length > 0) {
                card = slot[slot.length - 1];
            }
        }

        // Validación de carta (TS2345 fix: Asegurar que card no es undefined)
        if (!card || card.id !== payload.cardId) return false;

        if (SkipBoEngine.isValidMove(targetPile, card)) {
            // Extracción segura
            if (payload.source === 'hand') {
                player.hand.splice(cardIdx, 1);
            } else if (payload.source === 'goal') {
                player.goalPile.pop();
                player.goalRemaining = player.goalPile.length;
                if (player.goalRemaining === 0) {
                    this.state.status = 'finished';
                    this.state.winnerId = playerId;
                }
            } else if (payload.source === 'discard' && typeof payload.sourceIndex === 'number') {
                player.discards[payload.sourceIndex]?.pop();
            }

            targetPile.push(card);

            // Reciclaje de montón si llega a 12 (Rey)
            if (SkipBoEngine.isPileComplete(targetPile)) {
                this.deck.pushToPending(targetPile);
                this.state.commonPiles[payload.targetIndex] = [];
            }

            // Rellenar mano si se vacía durante el turno
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

        // Validación de slot (TS18048 fix)
        if (cardIdx === -1 || payload.targetIndex < 0 || payload.targetIndex > 3) return false;

        const targetSlot = player.discards[payload.targetIndex];
        if (!targetSlot) return false;

        // Extracción segura (TS2345 fix)
        const extracted = player.hand.splice(cardIdx, 1);
        const cardToDiscard = extracted[0];
        if (!cardToDiscard) return false;

        targetSlot.push(cardToDiscard);

        // Cambio de turno
        this.state.currentPlayerId = (this.state.me.id === playerId) ? this.state.opponent.id : this.state.me.id;

        // El siguiente jugador rellena su mano al inicio de su turno
        const nextPlayer = this.state.currentPlayerId === this.state.me.id ? this.state.me : this.state.opponent;
        if (nextPlayer && nextPlayer.hand.length < 5) {
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
            winnerId: this.state.winnerId,
            opponent: opponent ? {
                ...opponent,
                hand: Array(opponent.hand.length).fill(null),
                goalPile: opponent.goalPile.map((card, index) =>
                    (index === opponent.goalPile.length - 1) ? card : null
                )
            } : null as any
        };
    }
}