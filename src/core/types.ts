/**
 * Definición de los colores según el rango de la carta:
 * 1-4: azul, 5-8: verde, 9-12: rojo, Comodín: naranja
 */
export type CardColor = 'blue' | 'green' | 'red' | 'orange';

/**
 * Origen de una carta durante un movimiento
 */
export type CardSource = 'hand' | 'goal' | 'discard';

/**
 * Estructura de una carta individual
 */
export interface Card {
    id: string;          // UUID único para trackBy en Angular y validación en Back
    value: number;       // Valor numérico (1-12). Los comodines usan 0.
    isWild: boolean;     // Indica si es un comodín Skip-Bo
    displayColor: CardColor;
}


export interface GameConfig {
    goalPileSize: number; // El número manual de cartas objetivo
}
/**
 * Estado de un jugador individual
 */
export interface PlayerState {
    id: string;
    name: string;
    hand: Card[];        // Máximo 5 cartas
    goalPile: Card[];    // El mazo principal que hay que vaciar para ganar
    goalRemaining: number;
    discards: Card[][];  // 4 pilas de descarte (LIFO)
}

/**
 * Estado global de la partida (Lo que viaja por el socket)
 */
export interface GameState {
    gameId: string;
    currentPlayerId: string;
    status: 'playing' | 'finished' | 'waiting';
    commonPiles: Card[][]; // Las 4 pilas centrales donde se construye del 1 al 12
    me: PlayerState;
    opponent: PlayerState;
    drawPileCount: number; // Solo enviamos el número de cartas restantes en el mazo de robo
    pilesToRecycleCount: number; // <--- Añade esta línea
    winnerId?: string | undefined;
}

/**
 * Payload para el evento de jugar una carta a la pila común
 */
export interface PlayCardPayload {
    cardId: string;
    source: CardSource;
    sourceIndex?: number; // Índice de la pila de descarte (0-3) si el source es 'discard'
    targetIndex: number;  // Índice de la pila común (0-3)
}

/**
 * Payload para el evento de descartar (termina el turno)
 */
export interface DiscardCardPayload {
    cardId: string;
    targetIndex: number; // Cuál de los 4 slots de descarte (0-3)
}