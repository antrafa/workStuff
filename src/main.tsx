import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './app/theme'
import './app/background'
import { loadLanguage } from './lib/i18n'

// Everything with interface text is imported only after the language is known, so even a
// module-level constant (the menu, the state labels) can call tx() and get the right one.
loadLanguage().then(async () => {
  const [{ router }, { ToastProvider }] = await Promise.all([import('./app/router'), import('@/ui')])
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </StrictMode>,
  )
})
