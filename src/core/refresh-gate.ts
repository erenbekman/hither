export class RefreshGate {
  private running = false
  private queued = false

  get isRunning(): boolean {
    return this.running
  }

  begin(): boolean {
    if (this.running) {
      this.queued = true
      return false
    }
    this.running = true
    return true
  }

  finish(): boolean {
    this.running = false
    if (!this.queued) return false
    this.queued = false
    return true
  }
}
