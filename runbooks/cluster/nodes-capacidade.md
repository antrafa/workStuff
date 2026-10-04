# Capacidade e pressão nos nós

Um nó sob pressão de memória, disco ou PIDs começa a despejar pods (*eviction*) e a recusar novos. Este runbook acha o nó, a pressão e quem a causa.

**Quando usar:** nó `NotReady`, pods em `Evicted`, condições `MemoryPressure`/`DiskPressure`/`PIDPressure`, ou pods `Pending` por falta de recurso.

### Antes de começar
- `node`: nome do nó (do passo 1).
- Tudo aqui é leitura. `cordon`/`drain` não rodam pelo painel (veja *Preparar manutenção de nó*).

### 1. Nós e condição
```bash
kubectl get nodes -o wide
kubectl top nodes
```
> `top` mostra uso real; o scheduler decide por reserva (*requests*). Os dois importam.

### 2. Condições do nó suspeito
```bash
kubectl get node {{node}} -o jsonpath='{.status.conditions}'
```
> Qualquer condição de pressão com `"status":"True"` é o problema. `Ready` `Unknown`: o kubelet parou de responder (rede, VM travada).

### 3. Reserva x capacidade
```bash
kubectl describe node {{node}}
```
> Na seção *Allocated resources*, `Requests` perto de 100% significa nó cheio para o scheduler, mesmo com uso baixo. `Limits` muito acima de 100% (overcommit) explica OOMs em pico.

### 4. Quem está no nó
```bash
kubectl get pods -A --field-selector spec.nodeName={{node}} -o wide
```

### 5. Pods despejados
```bash
kubectl get pods -A --field-selector status.phase=Failed
```
> `Evicted` com `The node was low on resource: ephemeral-storage`: algum pod escreve muito em disco local (logs, arquivos temporários).

### 6. Eventos do nó
```bash
kubectl get events -A --field-selector involvedObject.name={{node}} --sort-by=.lastTimestamp
```
