// Erro de regra ou do cluster com o status HTTP que a tela deve receber.
export class ClusterError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}
