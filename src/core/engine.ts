import { Card } from './types.js';

export class SkipBoEngine {
    public static isValidMove(targetPile: Card[], cardToPlay: Card): boolean {
        // Caso 1: Pila vacía
        if (targetPile.length === 0) {
            return cardToPlay.isWild || cardToPlay.value === 1;
        }

        // Caso 2: Pila con cartas
        // Acceso seguro: ya sabemos que length > 0
        const lastCard = targetPile[targetPile.length - 1] as Card;
        const currentTopValue = this.getEffectiveValue(lastCard, targetPile.length);

        if (cardToPlay.isWild) {
            return currentTopValue < 12;
        }

        return cardToPlay.value === currentTopValue + 1;
    }

    public static getEffectiveValue(card: Card, positionInPile: number): number {
        // En Skip-Bo, si es comodín, su valor es su posición (1-indexed)
        return card.isWild ? positionInPile : card.value;
    }

    public static isPileComplete(targetPile: Card[]): boolean {
        if (targetPile.length === 0) return false;

        const lastCard = targetPile[targetPile.length - 1] as Card;
        return this.getEffectiveValue(lastCard, targetPile.length) === 12;
    }
}