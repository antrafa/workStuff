import { Factory } from 'lucide-react'

export default function FactoryPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex size-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
          <Factory className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Fábrica de Software</h1>
          <p className="text-sm text-zinc-400">Orquestre agentes especializados de desenvolvimento em worktrees isoladas</p>
        </div>
      </div>
    </div>
  )
}
