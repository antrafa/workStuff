# Quota e limites do namespace

ResourceQuota limita o total que um namespace pode reservar; LimitRange define padrões e máximos por container. Quando estouram, o pod nem é criado, e o erro aparece no ReplicaSet, não no pod.

**Quando usar:** deploy não cria pods novos, evento `exceeded quota` ou `forbidden: maximum ... per Container`, ou escalonamento que não sai do lugar.

### Antes de começar
- `namespace`.
- Tudo aqui é leitura; quota é alterada pelo time de plataforma.

### 1. Erros de criação recentes
```bash
kubectl get events -n {{namespace}} --field-selector reason=FailedCreate --sort-by=.lastTimestamp
```
> `exceeded quota: ..., requested: limits.memory=2Gi, used: ..., limited: ...`: a mensagem traz o pedido, o usado e o teto.

### 2. Quotas e quanto já foi usado
```bash
kubectl get resourcequota -n {{namespace}}
kubectl describe resourcequota -n {{namespace}}
```
> Compare *Used* com *Hard*. Rolling update precisa de folga para as réplicas extras (`maxSurge`) durante a troca; quota no limite trava deploy mesmo sem aumentar réplicas.

### 3. Limites por container (LimitRange)
```bash
kubectl get limitrange -n {{namespace}}
kubectl describe limitrange -n {{namespace}}
```
> *Default Request/Limit* é aplicado a container sem `resources`; isso consome quota sem ninguém perceber.

### 4. Quem está consumindo a quota
```bash
kubectl get pods -n {{namespace}} -o 'custom-columns=POD:.metadata.name,STATUS:.status.phase,CPU_REQ:.spec.containers[*].resources.requests.cpu,MEM_REQ:.spec.containers[*].resources.requests.memory'
```
> Pods `Failed`/`Succeeded` antigos (Jobs) também contam em algumas quotas (`pods`). Pods de ambientes esquecidos são a causa comum.

### Saída
- Reduzir `requests` superdimensionados (compare com `kubectl top pods`).
- Remover workloads abandonados no namespace.
- Pedir aumento de quota com o número do passo 1 em mãos.
