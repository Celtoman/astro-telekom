import { useEffect, useState } from "react"
import { peekNavigationJson, readNavigationJson } from "../lib/admin-api.mjs"
import { useNavigationRefresh } from "./useNavigationRefresh"

export function useNavigationQuery<T>(apiUrl: string, route: string | null, refreshKey = 0) {
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ route: string | null; data: T | null; error: string | null; refreshing: boolean }>(() => ({ route, data: route ? peekNavigationJson(apiUrl, route) : null, error: null, refreshing: route !== null }))
  useNavigationRefresh(() => setRevision(value => value + 1))
  useEffect(() => {
    if (route === null) {
      setResult({ route, data: null, error: null, refreshing: false })
      return
    }
    let active = true
    const cached = peekNavigationJson<T>(apiUrl, route)
    setResult({ route, data: cached, error: null, refreshing: true })
    const accept = (data: T) => { if (active) setResult(current => ({ ...current, route, data, error: null })) }
    const fail = (error: unknown) => { if (active) setResult(current => ({ ...current, error: error instanceof Error ? error.message : "Данные не обновлены" })) }
    void readNavigationJson<T>(apiUrl, route, {
      onUpdate: accept, onError: fail,
      onSettled: () => { if (active) setResult(current => ({ ...current, refreshing: false })) },
    }).then(accept).catch(fail)
    return () => { active = false }
  }, [apiUrl, route, refreshKey, revision])
  return result.route === route ? result : { route, data: null, error: null, refreshing: route !== null }
}
