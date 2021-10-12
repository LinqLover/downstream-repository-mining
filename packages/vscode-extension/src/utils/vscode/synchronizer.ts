import * as vscode from 'vscode'


/**
 * Synchronizes updates provided by a model with the view processing the updates.
 *
 * This helper class can be used to ensure that updates appear in the UI even before the model is busy again.
 * This is far away from an ideal solution: Every intermediate UI update will slow down the model, and if the UI should reject an event for whatever reason, the model would halt forever.
 * However, the only viable alternatives considered are timeouts (even slower) and web workers that enable true multiprocessing but have a larger implementational and computational overhead.
 * Based on empirical experience, this is deemed an acceptable solution for now.
 */
export class Synchronizer {
    constructor(
        public enablementCheck: () => boolean
    ) { }

    /** In milliseconds. */
    public updateInterval = 1000

    private lastUpdate: number | undefined
    private pendingResolvers: (() => void)[] = []

    /** Wrap a function for getting model data with this synchronizer. Whenever the wrapped function is called, signalize that all pending UI updates have been processed. */
    spy<TIn extends unknown[], TOut>($function: (...args: TIn) => TOut) {
        return (...args: TIn) => {
            this.wasUpdated()
            return $function(...args)
        }
    }

    /** Asynchronously wait until all pending UI updates have been processed. */
    fire<T>(eventEmitter: vscode.EventEmitter<T | void>) {
        const promise = this.isEnabled() && this.shouldUpdate() ? this.promise() : undefined
        eventEmitter.fire()
        return promise
    }

    protected wasUpdated() {
        for (let i = this.pendingResolvers.length - 1; i >= 0; i--) {
            this.pendingResolvers.splice(0, 1)[0]()
        }
    }

    protected isEnabled() {
        return this.enablementCheck()
    }

    protected shouldUpdate() {
        return !this.lastUpdate || this.now() - this.lastUpdate > this.updateInterval
    }

    protected promise() {
        return new Promise(resolve => {
            this.pendingResolvers.push(() => resolve(undefined))
        })
    }

    protected now() {
        return Date.now()
    }
}
