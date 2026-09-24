export function insertVariableAtSelection(value, selectionStart, selectionEnd, code, maxLength = Infinity) {
  const start = Math.max(0, Math.min(value.length, selectionStart))
  const end = Math.max(start, Math.min(value.length, selectionEnd))
  const token = `{${code}}`
  const next = value.slice(0, start) + token + value.slice(end)
  if (next.length > maxLength) return null
  const cursor = start + token.length
  return { value: next, selectionStart: cursor, selectionEnd: cursor }
}

const scopeRanks = { SITE: 0, CITY: 1, TARIFF: 2 }

export function filterVariableDefinitions(definitions, field, context, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase('ru')
  return definitions.filter((definition) =>
    definition.status === 'ACTIVE'
    && definition.allowedFields.includes(field)
    && scopeRanks[definition.scope] <= scopeRanks[context]
    && (!normalizedQuery || `${definition.code} ${definition.name}`.toLocaleLowerCase('ru').includes(normalizedQuery))
  )
}
