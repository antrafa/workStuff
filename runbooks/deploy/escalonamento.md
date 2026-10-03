# Escalonamento de Emergência

Ajuste rápido do número de réplicas de uma aplicação em produção ou homologação para responder a pico inesperado de tráfego ou reduzir carga degradada.

### Parâmetros
- `namespace`: Namespace da aplicação
- `app`: Label do aplicativo
- `deployment`: Nome do Deployment a ser escalado
- `replicas`: Quantidade desejada de réplicas (ex.: `3`, `5`, `10`)

### Procedimento

1. Consulte o estado atual do deployment (réplicas desejadas, atuais e prontas):
```bash
kubectl get deployment {{deployment}} -n {{namespace}}
```

2. Meça o consumo em tempo real de CPU e memória dos pods atuais:
```bash
kubectl top pods -n {{namespace}} -l app={{app}}
```

3. Ajuste a quantidade de réplicas do Deployment:
```bash
kubectl scale deployment/{{deployment}} --replicas={{replicas}} -n {{namespace}}
```

4. Acompanhe a subida e prontidão das novas réplicas:
```bash
kubectl rollout status deployment/{{deployment}} -n {{namespace}}
```

5. Verifique a distribuição final dos novos pods nos nós:
```bash
kubectl get pods -n {{namespace}} -l app={{app}} -o wide
```
