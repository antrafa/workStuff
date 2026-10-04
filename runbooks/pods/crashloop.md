# Pod em CrashLoopBackOff

O container sobe, morre e o Kubernetes tenta de novo com espera cada vez maior (até 5 minutos). Quase sempre a aplicação está dizendo o motivo no log da execução **anterior**, não na atual.

**Quando usar:** status `CrashLoopBackOff` ou `Error`, contagem de `RESTARTS` subindo.

**Não use se:** o motivo é `OOMKilled` (runbook *Pod encerrado por falta de memória*) ou o pod nunca chegou a rodar (`Pending`, `ImagePullBackOff`).

### Antes de começar
- `namespace`, `pod` (nome completo, do passo 1) e `deployment`.
- Passos 1 a 6 são leitura. O passo 7 reinicia e é bloqueado em PRO.

### 1. Quais pods estão falhando
```bash
kubectl get pods -n {{namespace}} -o wide
```
> Todos os pods do deployment falhando: problema de configuração ou dependência. Só um: problema do nó ou de dado específico.

### 2. Código de saída e motivo da última morte
```bash
kubectl get pod {{pod}} -n {{namespace}} -o jsonpath='{.status.containerStatuses[*].lastState.terminated}'
```
| `exitCode` / `reason` | Causa provável |
|---|---|
| `1`, `Error` | exceção na inicialização: leia o log (passo 3) |
| `137`, `OOMKilled` | memória: troque de runbook |
| `137`, `Error` | morto pelo kubelet: liveness probe falhando (runbook *Probes falhando*) |
| `127` / `126` | comando de entrada inexistente ou sem permissão na imagem |
| `0`, `Completed` | o processo terminou sozinho: o container não tem um processo que fique rodando |

### 3. Log da execução que morreu
```bash
kubectl logs {{pod}} -n {{namespace}} --previous --tail=150
```
> Procure a **primeira** exceção. Padrões comuns: variável de ambiente ausente, `Connection refused` para banco/fila, `Address already in use`, erro de migração de banco.

### 4. Log da tentativa atual
```bash
kubectl logs {{pod}} -n {{namespace}} --tail=100
```

### 5. Eventos do pod
```bash
kubectl get events -n {{namespace}} --field-selector involvedObject.name={{pod}} --sort-by=.lastTimestamp
```
> `Liveness probe failed` antes de cada restart: a aplicação está viva mas lenta para responder; não é crash de código.

### 6. O que mudou: imagem e revisão atual
```bash
kubectl rollout history deployment/{{deployment}} -n {{namespace}}
kubectl get deployment {{deployment}} -n {{namespace}} -o jsonpath='{.spec.template.spec.containers[*].image}'
```
> Começou a falhar logo após um deploy: o problema veio com a versão nova. O painel não faz `rollout undo`; volte a tag anterior pelo pipeline.

### 7. Reinício controlado (só se a causa já foi resolvida)
Reiniciar sem resolver a causa só reinicia a contagem de backoff. Use quando a dependência que estava fora (banco, fila) já voltou.
```bash
kubectl rollout restart deployment/{{deployment}} -n {{namespace}}
kubectl rollout status deployment/{{deployment}} -n {{namespace}} --timeout=120s
```
