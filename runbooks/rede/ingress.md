# Ingress Troubleshooting (HTTP 502 / 503 / 404)

Diagnóstico de regras de Ingress no Kubernetes quando requisições externas recebem status de erro como 502 Bad Gateway (upstream offline), 503 Service Unavailable (sem endpoints saudáveis) ou 404 Not Found (regra de caminho/host não casou).

### Parâmetros
- `namespace`: Namespace do Ingress e dos Services
- `ingress`: Nome do recurso Ingress

### Procedimento

1. Liste os Ingresses no namespace com os hosts mapeados e endereço IP associado:
```bash
kubectl get ingress -n {{namespace}}
```

2. Descreva o Ingress para inspecionar os hosts, caminhos (paths), Services de backend e portas configuradas:
```bash
kubectl describe ingress {{ingress}} -n {{namespace}}
```

3. Verifique se os Services apontados pelo Ingress realmente existem e estão ativos:
```bash
kubectl get svc -n {{namespace}}
```

4. Verifique os Endpoints de todos os Services do namespace para garantir que há pods saudáveis recebendo tráfego:
```bash
kubectl get endpoints -n {{namespace}}
```

5. Verifique os logs recentes do controlador ingress-nginx (se adotado no cluster):
```bash
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx --tail=100
```

6. Verifique se há eventos de Warning recentes no namespace que indiquem recusa de configuração:
```bash
kubectl get events -n {{namespace}} --field-selector type=Warning
```
