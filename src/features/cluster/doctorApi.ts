import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'

export type DoctorEvent =
  | { type: 'conversation'; id: string }
  | { type: 'user'; text: string }
  | { type: 'text' | 'thinking'; text: string }
  | { type: 'tool'; id: string; tool: string; input: { command?: string } }
  | { type: 'tool-result'; id: string; isError: boolean; content: string }
  | { type: 'status'; message: string }
  | { type: 'mutation'; line: string; action: string; allowed: boolean; reason: string | null }
  | { type: 'executed'; line: string; ok: boolean; output: string }
  | { type: 'error'; message: string }
  | { type: 'done'; pending: { line: string; action: string } | null }
  | { type: 'result' }

export type ConversationSummary = {
  id: string
  title: string
  kubeconfigId: string
  context: string
  environment: string | null
  updatedAt: string
  messages: number
  running: boolean
  pending: { line: string; action: string } | null
}
export type Conversation = ConversationSummary & { events: DoctorEvent[] }

export const fetchStatus = () => api.get<{ ok: boolean; provider: string; reason?: string }>('/cluster-doctor/status')
export const fetchConversations = () => api.get<ConversationSummary[]>('/cluster-doctor/conversations')
export const fetchConversation = (id: string) => api.get<Conversation>(`/cluster-doctor/conversations/${id}`)
export const deleteConversation = (id: string) => api.delete<{ ok: true }>(`/cluster-doctor/conversations/${id}`)
export const stopConversation = (id: string) => api.post<{ ok: true }>(`/cluster-doctor/conversations/${id}/stop`)

export const askDoctor = (body: { conversationId?: string; message: string }, onEvent: (e: DoctorEvent) => void, signal: AbortSignal) =>
  streamPost<DoctorEvent>('/cluster-doctor/ask', onEvent, signal, body)
export const approveDoctor = (id: string, onEvent: (e: DoctorEvent) => void, signal: AbortSignal) =>
  streamPost<DoctorEvent>(`/cluster-doctor/conversations/${id}/approve`, onEvent, signal)
export const rejectDoctor = (id: string, onEvent: (e: DoctorEvent) => void, signal: AbortSignal) =>
  streamPost<DoctorEvent>(`/cluster-doctor/conversations/${id}/reject`, onEvent, signal)
