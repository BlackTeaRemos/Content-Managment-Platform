/**
 * ComplexEventEmitter
 * @description A complex event emitter that supports event identifiers with string, number and undefined values
 * @example
 * const emitter = new ComplexEventEmitter();
 * emitter.on( [ 'chat', 123, 'message' ], ( text: string ) => {
 *    console.log( `Received message: ${ text }` );
 * } );
 * emitter.emit( [ 'chat', 123, 'message' ], 'Hello, world!' );
 * @exports ComplexEventEmitter
 */

export type Listener<T> = (...args: T[]) => void;
export type EventIdentifierSubset = string | number | boolean | undefined;
export type EventIdentifier = EventIdentifierSubset[];

export class TrieNode<T> {
    listeners: { id: string; listener: Listener<T> }[] = [];
    onceListeners: { id: string; listener: Listener<T> }[] = [];
    children: Map<string, TrieNode<T>> = new Map();
}

/**
 * ComplexEventEmitter
 * @description A complex event emitter that supports event identifiers with string, number and undefined values
 * @example
 * const emitter = new ComplexEventEmitter();
 * emitter.on( [ 'chat', 123, 'message' ], ( text: string ) => {
 *   console.log( `Received message: ${ text }` );
 * } );
 * emitter.emit( [ 'chat', 123, 'message' ], 'Hello, world!' );
 * @exports ComplexEventEmitter
 * @version 1.0.0
 * @since 1.0.0
 * @category Events
 * @param {void}
 * @returns {ComplexEventEmitter}
 */
export default class ComplexEventEmitter<EventData> {
    protected root: TrieNode<EventData> = new TrieNode();
    protected listenerIdCounter: number = 0;

    /**
   * @description Get the key part of the event identifier
   * @protected
   * @param {EventIdentifierSubset} value
   * @returns {string}
   * @memberof ComplexEventEmitter
   */
    protected getKeyPart(value: EventIdentifierSubset): string {
        return value === undefined ? `*` : String(value);
    }

    protected generateListenerId(): string {
        return `listener_${this.listenerIdCounter++}`;
    }

    /**
   * @description Add a listener to the event emitter
   * @protected
   * @param {TrieNode} node - The node to add the listener to
   * @param {EventIdentifier} eventIdentifier - The event identifier to listen for
   * @param {Listener} listener - The listener to add
   * @param {boolean} once - Whether the listener should only be called once
   * @returns {void}
   * @memberof ComplexEventEmitter
   * @since 1.0.0
   * @version 1.0.0
   * @category Events
   * @example
   * this.addListener( this.root, eventIdentifier, listener, false );
   */
    protected addListener(
        node: TrieNode<EventData>,
        eventIdentifier: EventIdentifier,
        listener: Listener<EventData>,
        once: boolean,
    ): string {
        const id = this.generateListenerId();
        const listenerObj = { id, listener };

        if (eventIdentifier.length === 0) {
            if (once) {
                node.onceListeners.push(listenerObj);
            } else {
                node.listeners.push(listenerObj);
            }
            return id;
        }

        const [head, ...tail] = eventIdentifier;
        const keyPart = this.getKeyPart(head);

        if (!node.children.has(keyPart)) {
            node.children.set(keyPart, new TrieNode());
        }

        return this.addListener(node.children.get(keyPart)!, tail, listener, once);
    }

    /**
   * @description Add a listener to the event emitter
   * @param {EventIdentifier} eventIdentifier - The event identifier to listen for
   * @param {Listener} listener - The listener to add
   * @returns {void}
   * @memberof ComplexEventEmitter
   * @since 1.0.0
   * @version 1.0.0
   * @category Events
   * @example
   * emitter.on( [ 'chat', 123, 'message' ], ( text: string ) => {
   *  console.log( `Received message: ${ text }` );
   * } );
   */
    public on(
        eventIdentifier: EventIdentifier,
        listener: Listener<EventData>,
    ): string {
        return this.addListener(this.root, eventIdentifier, listener, false);
    }

    /**
   * @description Add a listener to the event emitter that will only be called once
   * @param {EventIdentifier} eventIdentifier - The event identifier to listen for
   * @param {Listener} listener - The listener to add
   * @returns {void}
   * @memberof ComplexEventEmitter
   * @since 1.0.0
   * @version 1.0.0
   * @category Events
   * @example
   * emitter.once( [ 'chat', 123, 'message' ], ( text: string ) => {
   *   console.log( `Received message: ${ text }` );
   * } );
   * emitter.emit( [ 'chat', 123, 'message' ], 'Hello, world!' );
   * // Output: Received message: Hello, world!
   * emitter.emit( [ 'chat', 123, 'message' ], 'Hello, world!' );
   * // No output
   */
    public once(
        eventIdentifier: EventIdentifier,
        listener: Listener<EventData>,
    ): string {
        return this.addListener(this.root, eventIdentifier, listener, true);
    }

    /**
   * @description Emit an event
   * @protected
   * @param {TrieNode} node - The node to emit the event from
   * @param {EventIdentifier} eventIdentifier - The event identifier to emit
   * @param {any[]} args - The arguments to pass to the listeners
   * @returns {void}
   * @memberof ComplexEventEmitter
   * @since 1.0.0
   * @version 1.0.0
   * @category Events
   * @example
   * this.emitListeners( this.root, eventIdentifier, args );
   */
    protected emitListeners(
        node: TrieNode<EventData>,
        eventIdentifier: EventIdentifier,
        args: any[],
    ): void {
    // 1. Always fire the current node's listeners (prefix match)
        for (const listener of node.listeners) {
            listener.listener(...args);
        }

        for (const listener of node.onceListeners) {
            listener.listener(...args);
        }

        node.onceListeners = [];

        if (eventIdentifier.length === 0) {
            return;
        }

        const [head, ...tail] = eventIdentifier;
        const keyPart = this.getKeyPart(head);

        if (node.children.has(keyPart)) {
            this.emitListeners(node.children.get(keyPart)!, tail, args);
        }

        if (node.children.has(`*`)) {
            this.emitListeners(node.children.get(`*`)!, tail, args);
        }
    }

    /**
   * @description Emit an event
   * @param {EventIdentifier} eventIdentifier - The event identifier to emit
   * @param {any[]} args - The arguments to pass to the listeners
   * @returns {void}
   * @memberof ComplexEventEmitter
   * @since 1.0.0
   * @version 1.0.0
   * @category Events
   * @example
   * emitter.emit( [ 'chat', 123, 'message' ], 'Hello, world!' );
   * // Output: Received message: Hello, world!
   */
    public emit(eventIdentifier: EventIdentifier, ...args: any[]): void {
        this.emitListeners(this.root, eventIdentifier, args);
    }

    /**
   * @description Collect all event identifiers in the event emitter
   * @protected
   * @param {TrieNode} node - The node to collect the event identifiers from
   * @param {EventIdentifier} prefix - The prefix to add to the event identifiers
   * @returns {EventIdentifier[]}
   * @memberof ComplexEventEmitter
   * @since 1.0.0
   * @version 1.0.0
   * @category Events
   * @example
   * this.collectEventIdentifiers( this.root, [] );
   * // Output: [ [ 'chat', 123, 'message' ], [ 'chat', 123, 'message', 'edited' ] ]
   */
    protected collectEventIdentifiers(
        node: TrieNode<EventData>,
        prefix: EventIdentifier,
    ): EventIdentifier[] {
        const result: EventIdentifier[] = [];

        if (node.listeners.length > 0 || node.onceListeners.length > 0) {
            result.push(prefix);
        }

        for (const [key, child] of node.children.entries()) {
            const value =
        key === `*` ? undefined : isNaN(Number(key)) ? key : Number(key);
            result.push(...this.collectEventIdentifiers(child, [...prefix, value]));
        }

        return result;
    }
    /**
   * @description Get a list of all event identifiers in the event emitter
   * @returns {EventIdentifier[]} - An array of event identifiers
   * @memberof ComplexEventEmitter
   * @since 1.0.0
   * @version 1.0.0
   * @category Events
   * @example
   * const emitter = new ComplexEventEmitter();
   * emitter.on( [ 'chat', 123, 'message' ], ( text: string ) => {
   *    console.log( `Received message: ${ text }` );
   * } );
   * emitter.on( [ 'chat', 123, 'message', 'edited' ], ( text: string ) => {
   *    console.log( `Received edited message: ${ text }` );
   * } );
   * console.log( emitter.getEventList() );
   * // Output: [ [ 'chat', 123, 'message' ], [ 'chat', 123, 'message', 'edited' ] ]
   */
    public getEventList(): EventIdentifier[] {
        return this.collectEventIdentifiers(this.root, []);
    }

    /**
   * @description Remove all listeners from the event emitter
   * @protected
   * @param {TrieNode} node - The node to remove the listeners from
   * @param {EventIdentifier} eventIdentifier - The event identifier to remove the listeners from
   * @returns {void}
   * @memberof ComplexEventEmitter
   * @since 1.0.0
   * @version 1.0.0
   * @category Events
   * @example
   * this.removeListeners( this.root, eventIdentifier );
   * // Output: All listeners for the event identifier are removed
   */
    protected removeListeners(
        node: TrieNode<EventData>,
        eventIdentifier: EventIdentifier,
    ): void {
        if (eventIdentifier.length === 0) {
            node.listeners = [];
            node.onceListeners = [];
            return;
        }

        const [head, ...tail] = eventIdentifier;
        const keyPart = this.getKeyPart(head);

        if (node.children.has(keyPart)) {
            this.removeListeners(node.children.get(keyPart)!, tail);
        }
        if (node.children.has(`*`)) {
            this.removeListeners(node.children.get(`*`)!, tail);
        }
    }

    /**
   * @description Remove all listeners from the event emitter
   * @param {EventIdentifier} eventIdentifier - The event identifier to remove the listeners from
   * @returns {void}
   * @memberof ComplexEventEmitter
   * @since 1.0.0
   * @version 1.0.0
   * @category Events
   * @example
   * emitter.removeAllListeners( [ 'chat', 123, 'message' ] );
   * // Output: All listeners for the event identifier are removed
   */
    public removeAllListeners(eventIdentifier: EventIdentifier): void {
        this.removeListeners(this.root, eventIdentifier);
    }

    /**
   * @description Remove a specific listener from the event emitter
   * @protected
   * @param {TrieNode} node - The node to remove the listener from
   * @param {EventIdentifier} eventIdentifier - The event identifier to remove the listener from
   * @param {Listener} listener - The listener to remove
   * @returns {void}
   * @memberof ComplexEventEmitter
   * @since 1.0.0
   * @version 1.0.0
   * @category Events
   * @example
   * this.removeSpecificListener( this.root, eventIdentifier, listener );
   * // Output: The listener for the event identifier is removed
   */
    protected removeSpecificListener(
        node: TrieNode<EventData>,
        eventIdentifier: EventIdentifier,
        id: string,
    ): void {
        if (eventIdentifier.length === 0) {
            node.listeners = node.listeners.filter((l) => {
                return l.id !== id;
            });
            node.onceListeners = node.onceListeners.filter((l) => {
                return l.id !== id;
            });
            return;
        }

        const [head, ...tail] = eventIdentifier;
        const keyPart = this.getKeyPart(head);

        if (node.children.has(keyPart)) {
            this.removeSpecificListener(node.children.get(keyPart)!, tail, id);
        }
        if (node.children.has(`*`)) {
            this.removeSpecificListener(node.children.get(`*`)!, tail, id);
        }
    }

    /**
   * @description Remove a specific listener from the event emitter
   * @param {EventIdentifier} eventIdentifier - The event identifier to remove the listener from
   * @param {Listener} listener - The listener to remove
   * @returns {void}
   * @memberof ComplexEventEmitter
   * @since 1.0.0
   * @version 1.0.0
   * @category Events
   * @example
   * emitter.off( [ 'chat', 123, 'message' ], listener );
   * // Output: The listener for the event identifier is removed
   */
    public off(eventIdentifier: EventIdentifier, id: string | undefined): void {
        if (id) {
            this.removeSpecificListener(this.root, eventIdentifier, id);
        }
    }
}
