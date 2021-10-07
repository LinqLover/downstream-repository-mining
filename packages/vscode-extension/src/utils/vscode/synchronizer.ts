import * as vscode from 'vscode'


export class Synchronizer {
    constructor(
        public enablementCheck: () => boolean
    ) { }

    /** In milliseconds. */
    public updateInterval = 1000

    private lastUpdate: number | undefined
    private pendingResolvers: (() => void)[] = []

    spy<TIn extends unknown[], TOut>($function: (...args: TIn) => TOut) {
        return (...args: TIn) => {
            this.wasUpdated()
            return $function(...args)
        }
    }

    fire<T>(eventEmitter: vscode.EventEmitter<T | void>) {
        const promise = this.shouldUpdate() ? this.promise() : undefined
        eventEmitter.fire()
        return promise
    }

    protected wasUpdated() {
        if (!this.isEnabled()) {
            return
        }

        for (let i = this.pendingResolvers.length - 1; i >= 0; i--) {
            this.pendingResolvers.splice(0, 1)[0]()
        }
    }

    protected isEnabled() {
        return this.enablementCheck()
    }

    protected shouldUpdate() {
        const should = !this.lastUpdate || this.now() - this.lastUpdate > this.updateInterval
        console.log(should)
        return should
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
