import './dashboard.css'
import { ArrowRight, BookOpen, Compass, Search as SearchIcon, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { HelpModal } from '@/app/HelpModal'
import { tx } from '@/lib/i18n'
import { PRESET_GROUPS, findNeeds, type NeedMatch } from './needs'

// Home's "what do you need?": the way in for someone who does not know which screen does it
export function NeedFinder() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [help, setHelp] = useState<NeedMatch | null>(null)
  const matches = useMemo(() => findNeeds(query), [query])

  return (
    <section className="card need-finder">
      <div className="card-pad stack" style={{ ['--gap' as string]: '12px' }}>
        <div className="row" style={{ ['--gap' as string]: '8px' }}>
          <Compass size={16} style={{ color: 'var(--signal)' }} />
          <span className="card-title">{tx({ en: 'What do you need to do?', pt: 'O que você precisa fazer?' })}</span>
          <small className="muted">{tx({ en: 'Describe it in your own words; the panel shows the screen that does it and how.', pt: 'Descreva com as suas palavras; o painel mostra a tela que faz isso e como.' })}</small>
        </div>
        <form
          className="need-input"
          onSubmit={e => {
            e.preventDefault()
            if (matches[0]) navigate(matches[0].route)
          }}
        >
          <SearchIcon size={16} />
          <input
            className="input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={tx({ en: 'e.g. test an endpoint in HML, my pipeline failed, free port 8080…', pt: 'ex.: testar um endpoint em HML, minha esteira falhou, liberar a porta 8080…' })}
            aria-label={tx({ en: 'What do you need to do?', pt: 'O que você precisa fazer?' })}
          />
          {query && (
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setQuery('')} title={tx({ en: 'Clear', pt: 'Limpar' })}>
              <X size={14} />
            </button>
          )}
        </form>
        <div className="need-presets">
          {PRESET_GROUPS.map(g => (
            <div key={g.label} className="need-preset-group">
              <span className="eyebrow">{g.label}</span>
              <div className="row" style={{ flexWrap: 'wrap', ['--gap' as string]: '6px' }}>
                {g.presets.map(p => (
                  <button key={p.query} className="chip" aria-pressed={plainEq(query, p.query)} onClick={() => setQuery(p.query)}>{p.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {query.trim() && matches.length === 0 && (
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            {tx({ en: 'No screen matches these words. Try other ones, or press ', pt: 'Nenhuma tela bate com essas palavras. Tente outras, ou aperte ' })}
            <kbd>Ctrl K</kbd>
            {tx({ en: ' to see every screen.', pt: ' para ver todas as telas.' })}
          </p>
        )}

        {matches.length > 0 && (
          <ol className="need-results">
            {matches.map((m, i) => (
              <li key={m.id} className={i === 0 ? 'need-best' : ''}>
                <div className="need-head">
                  <b>{m.title}</b>
                  {m.screen && <span className="badge">{m.screen}</span>}
                </div>
                {/* The order of the steps is the order of the clicks, so it is a numbered list */}
                <ol className="need-steps">
                  {m.steps.map(step => <li key={step}>{step}</li>)}
                </ol>
                <div className="row" style={{ ['--gap' as string]: '6px' }}>
                  <Link to={m.route} className={`btn btn-sm ${i === 0 ? 'btn-primary' : ''}`}>
                    {tx({ en: `Open ${m.screen || 'screen'}`, pt: `Abrir ${m.screen || 'tela'}` })} <ArrowRight size={13} />
                  </Link>
                  {m.manual && (
                    <button className="btn btn-sm btn-ghost" onClick={() => setHelp(m)}>
                      <BookOpen size={13} /> {tx({ en: 'How to use', pt: 'Como usar' })}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      {help?.manual && <HelpModal slug={help.manual} title={help.screen} onClose={() => setHelp(null)} />}
    </section>
  )
}

const plainEq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
