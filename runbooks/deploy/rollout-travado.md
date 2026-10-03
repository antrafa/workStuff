# Rollout de Deployment Travado

Procedimento quando a atualização de uma aplicação não progride (bloqueada em `Waiting for deployment spec update to be observed` ou réplicas novas falhando na inicialização).

### Parâmetros
- `namespace`: Namespace do Deployment
- `app`: Label do aplicativo
- `deployment`: Nome do Deployment

### Procedimento

1. Verifique o status detalhado do rollout do deployment:
```bash
kubectl rollout status deployment/{{deployment}} -n {{namespace}}
```

2. Consulte o histórico de revisões anteriores do deployment:
```bash
kubectl rollout history deployment/{{deployment}} -n {{namespace}}
```

3. Liste os ReplicaSets do deployment para conferir a divisão de réplicas ativas entre a versão antiga e a nova:
```bash
kubectl get replicasets -n {{namespace}} -l app={{app}}
```

4. Liste todos os pods do deployment com seus respectivos estados e nós:
```bash
kubectl get pods -n {{namespace}} -l app={{app}} -o wide
```

5. Inspecione as condições (Conditions), estratégias de atualização e eventos do deployment:
```bash
kubectl describe deployment {{deployment}} -n {{namespace}}
```

6. Force um reinício seguro do rollout para reiniciar as réplicas mantendo a política de rolling update:
```bash
kubectl rollout restart deployment/{{deployment}} -n {{namespace}}
```
