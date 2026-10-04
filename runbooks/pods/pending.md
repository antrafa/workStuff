# Pod preso em Pending

O scheduler não encontrou nó que aceite o pod. A mensagem do scheduler, no fim do `describe`, diz exatamente qual regra cada nó falhou.

**Quando usar:** pod em `Pending` por mais de um minuto.

### Antes de começar
- `namespace` e `pod`.
- Tudo aqui é leitura.

### 1. Quais pods estão pendentes
```bash
kubectl get pods -n {{namespace}} --field-selector status.phase=Pending
```

### 2. A mensagem do scheduler
```bash
kubectl get events -n {{namespace}} --field-selector involvedObject.name={{pod}} --sort-by=.lastTimestamp
```
| Mensagem `0/N nodes are available:` | Causa | Próximo passo |
|---|---|---|
| `Insufficient cpu` / `Insufficient memory` | `requests` maiores que o livre em qualquer nó | passo 3 |
| `had untolerated taint` | nós reservados (taint) sem toleration no pod | passo 4 |
| `didn't match Pod's node affinity/selector` | `nodeSelector`/afinidade sem nó correspondente | passo 4 |
| `pod has unbound immediate PersistentVolumeClaims` | volume não provisionado | passo 5 |
| `exceeded quota` (evento do ReplicaSet) | ResourceQuota do namespace estourada | runbook *Quota e limites do namespace* |

### 3. Requests do pod contra capacidade livre
```bash
kubectl get pod {{pod}} -n {{namespace}} -o jsonpath='{.spec.containers[*].resources.requests}'
kubectl top nodes
```
> O scheduler decide por **requests**, não por uso real. Nó com 30% de uso pode estar 100% reservado. Veja a seção *Allocated resources* em `kubectl describe node <nó>`.

### 4. Taints dos nós e seletor do pod
```bash
kubectl get nodes -o 'custom-columns=NOME:.metadata.name,TAINTS:.spec.taints[*].key,STATUS:.status.conditions[-1].type'
kubectl get pod {{pod}} -n {{namespace}} -o jsonpath='{.spec.nodeSelector}{.spec.tolerations}'
```

### 5. Volumes pendentes
```bash
kubectl get pvc -n {{namespace}}
```
> PVC em `Pending`: runbook *Diagnóstico de storage e PVCs*.

### Saída
- Falta de capacidade: reduza `requests` (se superdimensionado) ou adicione nó.
- Taint/seletor: ajuste o manifest. Não remova taint de nó pelo painel (bloqueado em todos os ambientes).
