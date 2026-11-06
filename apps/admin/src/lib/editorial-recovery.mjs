const PREFIX = 'admin:editorial:recovery:v1:'
const TTL = 7 * 86400000
const encode = value => encodeURIComponent(value)
const keys = storage => Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean)
export function clearEditorialRecovery(storage, userId) {
  const prefix = `${PREFIX}${encode(userId)}:`
  try { for (const key of keys(storage)) if (key.startsWith(prefix)) storage.removeItem(key) } catch { /* Logout must still complete when storage is unavailable. */ }
}
export function createEditorialRecovery(storage, identity, writerId, now = Date.now) {
  if (![identity.userId, identity.siteId, identity.entityId, writerId].every(value => typeof value === 'string' && value)) throw new Error('Recovery requires a known account, site, material and writer')
  const prefix = `${PREFIX}${[identity.userId, identity.siteId, identity.entityId].map(encode).join(':')}:`
  const ownKey = prefix + encode(writerId), adopted = new Map()
  const read = key => { try { return JSON.parse(storage.getItem(key) || 'null') } catch { return null } }
  const removeMatching = (key, fingerprint) => { if (read(key)?.fingerprint === fingerprint) storage.removeItem(key) }
  return {
    write(value) { try { storage.setItem(ownKey, JSON.stringify({ ...value, updatedAt: now() })); return true } catch { return false } },
    clear(fingerprint) {
      // Old acknowledgment cannot remove the newer local input or its adopted backup.
      if (read(ownKey)?.fingerprint !== fingerprint) return
      removeMatching(ownKey, fingerprint)
      for (const [key, original] of adopted) removeMatching(key, original)
      adopted.clear()
    },
    adopt(candidate) { if (candidate?.key?.startsWith(prefix) && typeof candidate.fingerprint === 'string') adopted.set(candidate.key, candidate.fingerprint) },
    discard(candidate) { if (candidate?.key?.startsWith(prefix)) removeMatching(candidate.key, candidate.fingerprint) },
    candidates() {
      const result = []
      try {
        for (const key of keys(storage).filter(key => key.startsWith(prefix))) {
          const value = read(key)
          if (!value || typeof value.fingerprint !== 'string' || !Number.isFinite(value.updatedAt) || now() - value.updatedAt > TTL || value.updatedAt > now() + 60000) { storage.removeItem(key); continue }
          if (value.content && typeof value.content === 'object') result.push({ ...value, key })
        }
      } catch { return [] }
      return result.sort((a, b) => b.updatedAt - a.updatedAt)
    },
  }
}
