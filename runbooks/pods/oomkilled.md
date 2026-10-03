# Pod encerrado por falta de memória (OOMKilled)

Procedimento de investigação para pods terminados abruptamente pelo Linux OOM-Killer (`Exit Code 137`). Geralmente ocorre por pico de consumo que ultrapassou o `resources.limits.memory` configurado no container.

### Parâmetros
- `namespace`: Namespace do workload
- `app`: Label da aplicação
- `pod`: Nome do pod afetado
- `deployment`: Nome do deployment correspondente

### Procedimento

1. Liste os pods para conferir se o status ou `restarts` estão aumentando:
```bash
kubectl get pods -n {{namespace}} -l app={{app}}
```

2. Inspecione o pod para confirmar `Termination Reason: OOMKilled` e o limite atingido:
```bash
kubectl describe pod {{pod}} -n {{namespace}}
```

3. Verifique o consumo atual de memória e CPU dos pods do namespace:
```bash
kubectl top pods -n {{namespace}}
```

4. Consulte as últimas linhas de log antes da morte do container anterior:
```bash
kubectl logs {{pod}} -n {{namespace}} --previous --tail=200
```

5. Verifique a configuração de requests e limits de memória no deployment:
```bash
kubectl get deployment {{deployment}} -n {{namespace}} -o yaml
```

6. Caso necessário para liberar instâncias presas ou degradadas, execute um reinício controlado:
```bash
kubectl rollout restart deployment/{{deployment}} -n {{namespace}}
```
