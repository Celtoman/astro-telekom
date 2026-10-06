import { createContext } from "react"

export interface Administrator { id: string; email: string }
export const AdminWorkspaceContext = createContext<((user: Administrator) => void) | null>(null)
