# Probes falhando: pod Running mas não Ready, ou reiniciado pelo kubelet

A aplicação está de pé, mas o Kubernetes acha que não. Readiness falhando tira o pod do Service (usuário recebe 503); liveness falhando faz o kubelet matar o container (parece crash, mas o log não mostra erro).

**Quando usar:** pod `Running` com `0/1` em READY, Service sem endpoints com pods rodando, ou restarts com código 137 sem `OOMKilled`.

### Antes de começar
- `namespace`, `app` (label), `pod` e `deployment`.

### 1. Pods rodando mas não prontos
```bash
kubectl get pods -n {{namespace}} -l app={{app}}
```

### 2. Qual probe falha e com qual mensagem
```bash
kubectl get events -n {{namespace}} --field-selector involvedObject.name={{pod}} --sort-by=.lastTimestamp
```
| Evento | Significado |
|---|---|
| `Readiness probe failed: ... connection refused` | a aplicação ainda não abriu a porta, ou a porta da probe está errada |
| `... HTTP probe failed with statuscode: 404` | caminho da probe errado (ex.: `/health` x `/actuator/health`) |
| `... statuscode: 503` | a aplicação responde mas se declara indisponível (dependência fora) |
| `... context deadline exceeded` / `Client.Timeout` | resposta mais lenta que o `timeoutSeconds` |
| `Liveness probe failed` seguido de `Killing` | kubelet reiniciou o container |

### 3. Configuração das probes
```bash
kubectl get deployment {{deployment}} -n {{namespace}} -o jsonpath='{.spec.template.spec.containers[*].readinessProbe}'
kubectl get deployment {{deployment}} -n {{namespace}} -o jsonpath='{.spec.template.spec.containers[*].livenessProbe}'
kubectl get deployment {{deployment}} -n {{namespace}} -o jsonpath='{.spec.template.spec.containers[*].startupProbe}'
```
> Erros comuns: liveness com `initialDelaySeconds` menor que o tempo de boot da aplicação (Java/Spring costuma levar 30 a 90s) e sem `startupProbe`; liveness apontando para endpoint que checa banco (banco lento derruba todos os pods ao mesmo tempo).

### 4. O que a aplicação registra
```bash
kubectl logs {{pod}} -n {{namespace}} --tail=100
```
> Log mostrando que a aplicação terminou de subir **depois** do primeiro `Liveness probe failed`: o tempo de boot é maior que a janela da probe.

### Decisão
- Caminho/porta errados ou janela curta: corrija a probe no manifest (o painel não altera probes).
- Dependência fora fazendo a readiness responder 503: o comportamento está correto; resolva a dependência.
- Liveness checando dependência externa: tire a dependência da liveness; deixe-a só na readiness.
