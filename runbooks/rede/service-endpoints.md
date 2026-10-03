# Service sem Endpoints ou Falha de Conexão

Procedimento quando chamadas internas para um Service falham (timeout ou connection refused), ou quando o Service não consegue encaminhar tráfego para nenhum pod saudável.

### Parâmetros
- `namespace`: Namespace onde o Service e os pods residem
- `service`: Nome do Service do Kubernetes
- `app`: Label correspondente ao seletor do Service
- `deployment`: Nome do Deployment para reinício se necessário

### Procedimento

1. Descreva o Service para verificar portas mapeadas (Port e TargetPort) e o `Selector`:
```bash
kubectl describe svc {{service}} -n {{namespace}}
```

2. Verifique se o Service possui Endpoints registrados (se estiver vazio `<none>`, os pods não estão prontos ou os labels não batem):
```bash
kubectl get endpoints {{service}} -n {{namespace}}
```

3. Liste os pods da aplicação para conferir se os labels coincidem exatamente com o seletor:
```bash
kubectl get pods -n {{namespace}} -l app={{app}} -o wide
```

4. Verifique se os pods estão marcados como `Ready (1/1)` e se as probes (readinessProbe) estão passando:
```bash
kubectl get pods -n {{namespace}} -l app={{app}}
```

5. Verifique os logs dos pods do CoreDNS no namespace kube-system para checar se há falha de resolução interna de nomes:
```bash
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50
```

6. Caso os pods estejam presos ou degradados, reinicie o deployment:
```bash
kubectl rollout restart deployment/{{deployment}} -n {{namespace}}
```
