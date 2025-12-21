import { Card, CardColor } from './types.js';
import { v4 as uuidv4 } from 'uuid';

export class Deck {
    private cards: Card[] = [];
    private pendingToRecycle: Card[] = [];

    constructor() {
        this.generate();
        this.shuffle();
    }

    private generate(): void {
        // 144 cartas numeradas
        for (let i = 0; i < 12; i++) {
            for (let v = 1; v <= 12; v++) {
                this.cards.push({
                    id: uuidv4(),
                    value: v,
                    isWild: false,
                    displayColor: this.getColorByValue(v)
                });
            }
        }

        // 18 Comodines
        for (let i = 0; i < 18; i++) {
            this.cards.push({
                id: uuidv4(),
                value: 0,
                isWild: true,
                displayColor: 'orange'
            });
        }
    }

    private getColorByValue(v: number): CardColor {
        if (v >= 1 && v <= 4) return 'blue';
        if (v >= 5 && v <= 8) return 'green';
        return 'red';
    }

    public shuffle(): void {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = this.cards[i]!; // Non-null assertion segura aquí
            this.cards[i] = this.cards[j]!;
            this.cards[j] = temp;
        }
    }

    public draw(count: number): Card[] {
        const drawn: Card[] = [];
        for (let i = 0; i < count; i++) {
            // Si el mazo se vacía, forzamos el reciclaje de lo que haya
            if (this.cards.length === 0 && this.pendingToRecycle.length > 0) {
                this.recycleNow();
            }
            const card = this.cards.pop();
            if (card) drawn.push(card);
        }
        return drawn;
    }

    /**
     * Acumula una pila de 12. Retorna true si se activó el reciclaje de las 3 pilas.
     */
    public pushToPending(pile: Card[]): boolean {
        // Limpiamos los comodines para que vuelvan a valer 0
        const cleaned = pile.map(c => c.isWild ? { ...c, value: 0 } : c);
        this.pendingToRecycle.push(...cleaned);

        // Si llegamos a 3 pilas (36 cartas), reciclamos
        if (this.pendingToRecycle.length >= 36) {
            this.recycleNow();
            return true;
        }
        return false;
    }

    private recycleNow(): void {
        // 1. Barajamos el bloque acumulado
        for (let i = this.pendingToRecycle.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));

            // Añadimos '!' para confirmar que no son undefined
            const itemI = this.pendingToRecycle[i]!;
            const itemJ = this.pendingToRecycle[j]!;

            this.pendingToRecycle[i] = itemJ;
            this.pendingToRecycle[j] = itemI;
        }

        // 2. Lo ponemos al FONDO (inicio del array)
        this.cards = [...this.pendingToRecycle, ...this.cards];
        this.pendingToRecycle = [];
    }

    get count(): number {
        return this.cards.length;
    }

    get pendingCount(): number {
        // Retorna cuántas pilas de 12 tenemos guardadas
        return Math.floor(this.pendingToRecycle.length / 12);
    }

}