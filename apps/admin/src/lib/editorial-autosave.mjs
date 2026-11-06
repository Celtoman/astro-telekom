export function editorialFingerprint(value) {
  const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, normalize(value[key])])) : value
  return JSON.stringify(normalize(value))
}

/** Serial saves acknowledge their own content, never whatever is currently in the form. */
export class EditorialAutosave {
  constructor({ content, revision, save, onState = () => {}, recovery = null, delay = 1000, now = Date.now }) {
    this.latest = structuredClone(content); this.revision = revision
    this.persisted = editorialFingerprint(content); this.save = save; this.onState = onState
    this.recovery = recovery; this.delay = delay; this.now = now
    this.status = 'saved'; this.error = null; this.savedAt = null
    this.running = null; this.timer = null; this.paused = false; this.closed = false; this.recoveryAvailable = !!recovery; this.checkpointKey = null
  }
  get state() { return { status: this.status, revision: this.revision, dirty: editorialFingerprint(this.latest) !== this.persisted, savedAt: this.savedAt, error: this.error, recoveryAvailable: this.recoveryAvailable } }
  emit() { if (!this.closed) this.onState(this.state) }
  backup() {
    if (!this.recovery) return
    try { this.recoveryAvailable = this.recovery.write({ content: structuredClone(this.latest), fingerprint: editorialFingerprint(this.latest), baseRevision: this.revision }) !== false }
    catch { this.recoveryAvailable = false }
  }
  clearBackup(fingerprint) { try { this.recovery?.clear(fingerprint) } catch { this.recoveryAvailable = false } }
  schedule() {
    clearTimeout(this.timer)
    if (this.closed || this.paused || !this.state.dirty) return
    this.timer = setTimeout(() => { this.timer = null; void this.flush().catch(() => {}) }, this.delay)
  }
  change(content) {
    if (this.closed) return
    this.latest = structuredClone(content); this.backup()
    if (!this.paused) this.status = this.running ? 'saving' : this.state.dirty ? 'dirty' : 'saved'
    if (!this.state.dirty && !this.running) this.clearBackup(editorialFingerprint(this.latest))
    this.emit(); this.schedule()
  }
  flush(checkpoint = false) {
    clearTimeout(this.timer); this.timer = null
    if (this.closed) return Promise.reject(new Error('Editor is closed'))
    if (this.paused) return Promise.reject(this.error || new Error('Conflict'))
    if (this.running) return this.running.then(() => this.state.dirty || checkpoint ? this.flush(checkpoint) : this.snapshot())
    this.running = this.drain(checkpoint).finally(() => { this.running = null })
    return this.running
  }
  snapshot() { return { content: structuredClone(this.latest), revision: this.revision, fingerprint: editorialFingerprint(this.latest) } }
  async drain(checkpoint) {
    while (this.state.dirty || this.revision === 0 || checkpoint && this.checkpointKey !== `${this.revision}:${this.persisted}`) {
      const content = structuredClone(this.latest), fingerprint = editorialFingerprint(content)
      this.status = 'saving'; this.emit()
      let result
      try {
        result = await this.save(content, this.revision, checkpoint)
        if (this.closed) throw new Error('Editor is closed')
        if (!Number.isSafeInteger(result.revision) || result.revision < this.revision || editorialFingerprint(result.content) !== fingerprint) throw new Error('Сервер подтвердил другую версию. Обновите данные и сравните текст перед продолжением.')
      } catch (error) {
        if (this.closed) throw error
        this.error = error; this.paused = error?.status === 409
        this.status = this.paused ? 'conflict' : 'error'; this.emit(); throw error
      }
      this.revision = result.revision; this.persisted = fingerprint; this.savedAt = this.now(); this.error = null
      if (checkpoint) this.checkpointKey = `${this.revision}:${fingerprint}`
      this.clearBackup(fingerprint); this.status = this.state.dirty ? 'dirty' : 'saved'; this.emit()
    }
    return this.snapshot()
  }
  resolveConflict(server, keepLocal) {
    if (this.closed || !Number.isSafeInteger(server.revision) || server.revision < 0) return
    const localFingerprint = editorialFingerprint(this.latest)
    if (!keepLocal) this.clearBackup(localFingerprint)
    this.revision = server.revision; this.persisted = editorialFingerprint(server.content)
    if (!keepLocal) this.latest = structuredClone(server.content)
    this.error = null; this.paused = false; this.status = this.state.dirty ? 'dirty' : 'saved'
    if (this.state.dirty) this.backup(); else this.clearBackup(editorialFingerprint(this.latest))
    this.emit(); this.schedule()
  }
  recover(candidate) {
    if (this.closed) return
    if (candidate.baseRevision === this.revision) { this.change(candidate.content); return }
    clearTimeout(this.timer); this.timer = null
    this.latest = structuredClone(candidate.content); this.backup()
    this.error = Object.assign(new Error('Серверная версия изменилась после создания локальной копии. Сравните версии.'), {status:409})
    this.paused = true; this.status = 'conflict'; this.emit()
  }
  dispose() { this.closed = true; clearTimeout(this.timer); this.timer = null }
}
