# Pod encerrado por falta de memória (OOMKilled)

O container usou mais memória que o `limits.memory` e o kernel o matou (código 137). A decisão é entre dois caminhos: o limite está baixo para o uso normal, ou a aplicação tem pico ou vazamento.

**Quando usar:** `OOMKilled` no `describe`, ou restarts com código 137.

### Antes de começar
- `namespace`, `app` (label), `pod` e `deployment`.
- Passos de leitura em qualquer ambiente; ajuste de limite é feito no manifest/pipeline, não pelo painel.

### 1. Confirme o OOM
```bash
kubectl get pod {{pod}} -n {{namespace}} -o jsonpath='{.status.containerStatuses[*].lastState.terminated}'
```
> `"reason":"OOMKilled"` confirma. `137` com `"reason":"Error"` é outra coisa (liveness probe, runbook *Probes falhando*).

### 2. Limites configurados
```bash
kubectl get deployment {{deployment}} -n {{namespace}} -o jsonpath='{.spec.template.spec.containers[*].resources}'
```
> Sem `limits.memory`: o OOM veio do **nó** sem memória, não do container (veja *Capacidade e pressão nos nós*).

### 3. Consumo atual dos pods
```bash
kubectl top pods -n {{namespace}} -l app={{app}}
```
> Uso estável perto do limite (acima de ~85%): o limite está baixo para a carga normal. Uso baixo agora e OOM depois: pico (relatório, upload grande) ou vazamento.

### 4. Frequência dos restarts
```bash
kubectl get pods -n {{namespace}} -l app={{app}}
```
> Restarts em intervalos regulares (a cada X horas): vazamento de memória. Restarts em horário de pico: carga.

### 5. O que a aplicação fazia antes de morrer
```bash
kubectl logs {{pod}} -n {{namespace}} --previous --tail=200
```
> Aplicação Java: confira se `-Xmx` (ou `MaxRAMPercentage`) deixa folga para memória fora do heap. Heap igual ao limite do container sempre termina em OOM.

### Decisão
- **Limite baixo:** aumente `limits.memory` (e `requests` junto) no manifest e publique pelo pipeline.
- **Vazamento:** reiniciar só adia. Abra issue com o padrão de restarts do passo 4.
- **Paliativo enquanto isso** (bloqueado em PRO):
```bash
kubectl rollout restart deployment/{{deployment}} -n {{namespace}}
```
