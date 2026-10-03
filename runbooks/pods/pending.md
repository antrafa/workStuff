# Pod preso em Pending (Agendamento)

Diagnóstico de pods que não conseguem ser agendados pelo scheduler do Kubernetes. As causas típicas são recursos insuficientes nos nós (CPU/memória), taints não tolerados, regras de afinidade ou PersistentVolumeClaims não vinculados.

### Parâmetros
- `namespace`: Namespace do pod
- `pod`: Nome do pod com status Pending

### Procedimento

1. Liste todos os pods em estado Pending no namespace:
```bash
kubectl get pods -n {{namespace}} --field-selector status.phase=Pending
```

2. Descreva o pod e leia a seção `Events` no final para ver a mensagem do scheduler (ex.: `0/X nodes are available: insufficient cpu`):
```bash
kubectl describe pod {{pod}} -n {{namespace}}
```

3. Verifique o consumo atual e a capacidade dos nós do cluster:
```bash
kubectl top nodes
```

4. Liste as condições e taints de todos os nós para checar bloqueios de agendamento:
```bash
kubectl describe nodes
```

5. Verifique se há requisições de volume (PVC) presas em Pending que impeçam o pod de subir:
```bash
kubectl get pvc -n {{namespace}}
```

6. Liste os eventos de aviso do namespace para cruzar erros de provisionamento ou quota:
```bash
kubectl get events -n {{namespace}} --field-selector type=Warning
```
