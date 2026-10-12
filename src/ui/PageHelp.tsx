import { createContext, useContext } from 'react'

// A ajuda de cada tela é a página dela no manual (app/manual.ts); o Page só sabe se ela existe e como abrir.
export type PageHelp = { open: () => void } | null

export const PageHelpContext = createContext<PageHelp>(null)
export const usePageHelp = () => useContext(PageHelpContext)
