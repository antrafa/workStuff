# Saúde Geral do Cluster

Varredura operacional ampla do cluster Kubernetes conectado. Ideal para início de plantão, triagem de incidentes sistêmicos ou validação pós-manutenção.

### Procedimento

1. Confirme a conectividade e os endpoints do Kubernetes Control Plane:
```bash
kubectl cluster-info
```

2. Verifique o status de todos os nós (Ready, NotReady, SchedulingDisabled), versão e IPs:
```bash
kubectl get nodes -o wide
```

3. Verifique a utilização de CPU e memória em todos os nós do cluster:
```bash
kubectl top nodes
```

4. Verifique o estado dos componentes vitais de rede, DNS e storage no namespace kube-system:
```bash
kubectl get pods -n kube-system -o wide
```

5. Verifique todos os eventos de tipo Warning ativos no cluster para identificar falhas sistêmicas:
```bash
kubectl get events -A --field-selector type=Warning
```
