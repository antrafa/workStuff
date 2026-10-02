import { createContext, useContext } from 'react'

// A ajuda de cada tela é conteúdo da aplicação (app/help.ts); o Page só sabe se ela existe e como abrir.
export type PageHelp = { purpose: string; open: () => void } | null

export const PageHelpContext = createContext<PageHelp>(null)
export const usePageHelp = () => useContext(PageHelpContext)
