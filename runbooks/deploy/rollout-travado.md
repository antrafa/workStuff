# Rollout de deployment travado

A atualização começou mas não termina: réplicas novas não ficam prontas, e o Kubernetes mantém as antigas no ar (rolling update protege o usuário). O trabalho é descobrir por que a versão nova não fica pronta.

**Quando usar:** `rollout status` parado em `Waiting for deployment ... rollout to finish`, pipeline de deploy expirando, ou condição `ProgressDeadlineExceeded`.

### Antes de começar
- `namespace`, `app` (label) e `deployment`.
- O painel **não** faz `rollout undo`. Para voltar versão, reimplante a tag anterior pelo pipeline.

### 1. Situação do rollout
```bash
kubectl rollout status deployment/{{deployment}} -n {{namespace}} --timeout=20s
kubectl get deployment {{deployment}} -n {{namespace}}
```
> `UP-TO-DATE` menor que o desejado e `AVAILABLE` igual ao antigo: as réplicas novas não ficam prontas; as antigas seguram o tráfego.

### 2. Condições do deployment
```bash
kubectl get deployment {{deployment}} -n {{namespace}} -o jsonpath='{.status.conditions}'
```
> `ProgressDeadlineExceeded`: passou do `progressDeadlineSeconds` sem progresso. `ReplicaFailure` com `exceeded quota`: runbook *Quota e limites do namespace*.

### 3. ReplicaSet antigo x novo
```bash
kubectl get replicasets -n {{namespace}} -l app={{app}}
```
> O ReplicaSet mais novo (menor `AGE`) é a versão sendo implantada. `READY` 0 nele aponta para os pods novos.

### 4. Estado dos pods novos
```bash
kubectl get pods -n {{namespace}} -l app={{app}} -o wide
```
| Status dos pods novos | Siga para |
|---|---|
| `CrashLoopBackOff` / `Error` | *Pod em CrashLoopBackOff* |
| `ImagePullBackOff` | *Falha ao baixar imagem* |
| `Pending` | *Pod preso em Pending* |
| `Running` com `0/1` | *Probes falhando* |

### 5. Histórico de revisões
```bash
kubectl rollout history deployment/{{deployment}} -n {{namespace}}
```
> Use para identificar a revisão (e a tag) anterior que funcionava, para o rollback pelo pipeline.

### 6. Reinício (só quando a causa foi corrigida fora do código)
Ex.: Secret ou ConfigMap atualizado. Bloqueado em PRO. Reiniciar com a mesma imagem quebrada não destrava nada.
```bash
kubectl rollout restart deployment/{{deployment}} -n {{namespace}}
```
