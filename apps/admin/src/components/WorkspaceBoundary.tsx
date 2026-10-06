import { Component, type ReactNode } from "react"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"

export class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <div className="mx-auto max-w-3xl space-y-4 p-6"><Alert variant="destructive"><AlertTitle>Не удалось открыть раздел</AlertTitle><AlertDescription>Возможно, приложение обновилось или соединение прервалось. Обновите страницу, чтобы загрузить актуальную версию.</AlertDescription></Alert><Button onClick={() => window.location.reload()}>Обновить страницу</Button></div>
  }
}
