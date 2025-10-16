/**
 * MathReader class for parsing and executing simple math operations on objects.
 * Supports assignment and arithmetic operations, with handler functions for each operation.
 *
 * @example
 * const reader = new MathReader();
 * const obj = { math1: 123 };
 * reader.setHandler('+=', (a, b) => a + b);
 * const result = reader.execute(obj, 'math1 += 22'); // { math1: 145 }
 */
export class MathReader {
    /**
     * Map of operation handlers
     * @type {Record<string, (left: any, right: any) => any>} - Maps operation to handler function
     */
    private _handlers: Record<string, (left: any, right: any) => any> = {};

    /**
     * Registers a handler for a specific operation.
     * @param operation string - The operation symbol (e.g., '+='). Example: '+='
     * @param handler function - Handler function (left, right) => result
     * @returns void
     */
    public setHandler(operation: string, handler: (left: any, right: any) => any): void {
        this._handlers[operation] = handler;
    }

    /**
     * Parses and executes a math operation on the given object.
     * @param obj Record<string, any> - The object to operate on. Example: { math1: 123 }
     * @param expr string - The math expression (e.g., 'math1 += 22'). Example: 'math1 += 22'
     * @returns Record<string, any> - The updated object. Example: { math1: 145 }
     */
    public execute(obj: Record<string, any>, expr: string): Record<string, any> {
        // Passive-aggressive: If you can't write a simple math expression, why are you even here?
        const match = expr.match(/^(\w+)\s*([+\-*/\^]=)\s*(\d+(?:\.\d+)?)$/);

        if (!match) {
            throw new Error(`Invalid math expression: '${expr}'. Try harder.`);
        }
        const [_, left, op, right] = match;

        // First ensure the operator is supported to surface the intended error
        if (!(op in this._handlers)) {
            throw new Error(`No handler registered for operation '${op}'.`);
        }

        if (!(left in obj)) {
            throw new Error(`Variable '${left}' not found in object.`);
        }
        const leftVal = obj[left];
        const rightVal = Number(right);
        obj[left] = this._handlers[op](leftVal, rightVal);
        return obj;
    }
}

// Example default handlers
const defaultMathReader = new MathReader();
defaultMathReader.setHandler(`+=`, (a, b) => {
    return a + b;
});
defaultMathReader.setHandler(`-=`, (a, b) => {
    return a - b;
});
defaultMathReader.setHandler(`*=`, (a, b) => {
    return a * b;
});
defaultMathReader.setHandler(`/=`, (a, b) => {
    return a / b;
});

export { defaultMathReader };
