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
        console.log(`[Session] 🟢 Partida creada: ${gameId} por ${p1Name} (${p1Id})`);
    }

    public join(playerId: string, playerName: string): void {
        console.log(`\n--- 📥 Intento de Join [Game: ${this.state.gameId}] ---`);

        // Caso 1: El Creador (P1) o el Oponente (P2) ya existente se reconecta
        const isP1 = this.state.me.id === playerId;
        const isP2 = this.state.opponent && this.state.opponent.id === playerId;

        if (isP1 || isP2) {
            console.log(`   ✅ Jugador ${isP1 ? 'P1' : 'P2'} reconectado: ${playerName} (${playerId})`);
            if (isP1) this.state.me.name = playerName;
            else if (this.state.opponent) this.state.opponent.name = playerName;
            return;
        }

        // Caso 2: Es un nuevo oponente (ID distinto a P1) y la partida espera
        if (this.state.status === 'waiting' && !this.state.opponent) {
            console.log(`   🚀 P2 unido por primera vez: ${playerName} (${playerId}). Iniciando partida.`);
            this.state.opponent = this.initPlayer(playerId, playerName);
            this.state.status = 'playing';
            this.setupInitialGame();
            return;
        }

        console.warn(`   ❌ Intento de unión rechazado. Player: ${playerId}, Status Actual: ${this.state.status}`);
    }

    public isPlayerInGame(playerId: string): boolean {
        return (this.state.me && this.state.me.id === playerId) ||
            (this.state.opponent && this.state.opponent.id === playerId);
    }

    private initPlayer(id: string, name: string): PlayerState {
        return { id, name, hand: [], goalPile: [], goalRemaining: 0, discards: [[], [], [], []] };
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
        const isP1 = this.state.me.id === playerId;
        const playerTag = isP1 ? 'P1' : 'P2';

        if (this.state.currentPlayerId !== playerId || this.state.status !== 'playing') {
            console.warn(`[Move] ⛔ Intento de ${playerTag} fuera de turno.`);
            return false;
        }

        const player = isP1 ? this.state.me : this.state.opponent;
        const targetPile = this.state.commonPiles[payload.targetIndex];
        if (!targetPile) return false;

        let card: Card | undefined;
        let cardIdx = -1;

        if (payload.source === 'hand') {
            cardIdx = player.hand.findIndex(c => c.id === payload.cardId);
            if (cardIdx !== -1) card = player.hand[cardIdx];
        } else if (payload.source === 'goal') {
            card = player.goalPile[player.goalPile.length - 1];
        } else if (payload.source === 'discard' && typeof payload.sourceIndex === 'number') {
            const slot = player.discards[payload.sourceIndex];
            if (slot && slot.length > 0) card = slot[slot.length - 1];
        }

        if (!card || card.id !== payload.cardId) {
            console.warn(`[Move] ❌ Carta no encontrada: ${payload.cardId} en ${payload.source}`);
            return false;
        }

        if (SkipBoEngine.isValidMove(targetPile, card)) {
            if (payload.source === 'hand') player.hand.splice(cardIdx, 1);
            else if (payload.source === 'goal') {
                player.goalPile.pop();
                player.goalRemaining = player.goalPile.length;
                if (player.goalRemaining === 0) {
                    console.log(`[Game] 🏆 ¡${player.name} (${playerTag}) ha ganado!`);
                    this.state.status = 'finished';
                    this.state.winnerId = playerId;
                }
            } else if (payload.source === 'discard' && typeof payload.sourceIndex === 'number') {
                player.discards[payload.sourceIndex]?.pop();
            }

            targetPile.push(card);
            console.log(`[Move] ✅ ${playerTag} jugó ${card.value} en pila ${payload.targetIndex}`);

            if (SkipBoEngine.isPileComplete(targetPile)) {
                this.deck.pushToPending(targetPile);
                this.state.commonPiles[payload.targetIndex] = [];
            }
            if (player.hand.length === 0 && this.state.status === 'playing') {
                console.log(`[Game] 🃏 ${playerTag} mano vacía, robando 5 cartas.`);
                player.hand = this.deck.draw(5);
            }
            this.state.drawPileCount = this.deck.count;
            return true;
        }

        console.warn(`[Move] ❌ Movimiento inválido de ${playerTag}: ${card.value} sobre pila ${payload.targetIndex}`);
        return false;
    }

    public discard(playerId: string, payload: DiscardCardPayload): boolean {
        const isP1 = this.state.me.id === playerId;
        const playerTag = isP1 ? 'P1' : 'P2';

        if (this.state.currentPlayerId !== playerId || this.state.status !== 'playing') {
            console.warn(`[Discard] ⛔ ${playerTag} intentó descartar fuera de turno.`);
            return false;
        }

        const player = isP1 ? this.state.me : this.state.opponent;
        const cardIdx = player.hand.findIndex(c => c.id === payload.cardId);
        if (cardIdx === -1 || payload.targetIndex < 0 || payload.targetIndex > 3) return false;
        const targetSlot = player.discards[payload.targetIndex];
        if (!targetSlot) return false;

        const extracted = player.hand.splice(cardIdx, 1);
        const cardToDiscard = extracted[0];
        if (!cardToDiscard) return false;
        targetSlot.push(cardToDiscard);

        console.log(`[Discard] 🗑️ ${playerTag} descartó en slot ${payload.targetIndex}.`);

        this.state.currentPlayerId = (this.state.me.id === playerId) ? this.state.opponent.id : this.state.me.id;
        const nextPlayer = this.state.currentPlayerId === this.state.me.id ? this.state.me : this.state.opponent;

        if (nextPlayer && nextPlayer.hand.length < 5) {
            const toDraw = 5 - nextPlayer.hand.length;
            console.log(`[Game] 🃏 Siguiente turno: ${nextPlayer.id}. Robando ${toDraw} cartas.`);
            nextPlayer.hand.push(...this.deck.draw(toDraw));
        }

        this.state.drawPileCount = this.deck.count;
        return true;
    }

    public getGameState(requestingPlayerId: string): GameState {
        const isP1 = this.state.me.id === requestingPlayerId;
        const me = isP1 ? this.state.me : this.state.opponent;
        const opponent = isP1 ? this.state.opponent : this.state.me;
        return {
            ...this.state,
            me,
            opponent: opponent ? {
                ...opponent,
                hand: Array(opponent.hand.length).fill(null),
                goalPile: opponent.goalPile.map((c, i) => i === opponent.goalPile.length - 1 ? c : null)
            } : null as any
        };
    }
}