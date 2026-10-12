import { BookMarked } from 'lucide-react'
import { Link } from 'react-router'
import { Async, Markdown, Modal } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { tx } from '@/lib/i18n'
import { loadManualPage } from '@/features/manual/content'
import { manualPath } from './manual'

// The screen's page of the manual, opened by the "?" and the title's help link.
export function HelpModal({ slug, title, onClose }: { slug: string; title: string; onClose: () => void }) {
  const text = useAsync(() => loadManualPage(slug), [slug])
  return (
    <Modal
      title={tx({ en: `How to use · ${title}`, pt: `Como usar · ${title}` })}
      width={820}
      onClose={onClose}
      footer={
        <Link to={manualPath(slug)} className="btn btn-primary" onClick={onClose}>
          <BookMarked size={14} /> {tx({ en: 'Open in the documentation', pt: 'Abrir na documentação' })}
        </Link>
      }
    >
      <div className="help-doc">
        <Async state={text}>{md => <Markdown>{md}</Markdown>}</Async>
      </div>
    </Modal>
  )
}
