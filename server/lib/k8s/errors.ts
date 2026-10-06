// A rule or cluster error with the HTTP status the screen should get.
export class ClusterError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}
