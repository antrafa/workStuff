# Capacidade e Pressão nos Nós

Procedimento para identificar e mitigar nós sob condições críticas de pressão (`MemoryPressure`, `DiskPressure`, `PIDPressure` ou `NetworkUnavailable`).

### Parâmetros
- `node`: Nome do nó do Kubernetes (ex.: `node-pool-1-worker-01`)

### Procedimento

1. Liste todos os nós do cluster para identificar quais estão com status anormal:
```bash
kubectl get nodes
```

2. Meça a alocação e utilização percentual de CPU e memória por nó:
```bash
kubectl top nodes
```

3. Inspecione detalhadamente o nó suspeito (verifique o bloco Conditions e os recursos alocados):
```bash
kubectl describe node {{node}}
```

4. Liste todos os pods em execução no nó especificado para identificar cargas pesadas ou desbalanceadas:
```bash
kubectl get pods -A --field-selector spec.nodeName={{node}} -o wide
```

5. Verifique eventos associados especificamente a este nó:
```bash
kubectl get events -A --field-selector involvedObject.name={{node}}
```
