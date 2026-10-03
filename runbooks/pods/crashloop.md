# Pod em CrashLoopBackOff

Diagnóstico de pods que entram em falha repetida após a inicialização. A maioria dos casos decorre de erro na inicialização da aplicação (falta de variável de ambiente, porta ocupada, erro de sintaxe ou dependência indisponível).

### Parâmetros
- `namespace`: Namespace onde o pod e o deployment estão alocados
- `app`: Label do aplicativo (ex.: `pedidos-api`)
- `pod`: Nome do pod com falha (ex.: `pedidos-api-7d9f8b6c4-x2klm`)
- `deployment`: Nome do deployment para reinício seguro (ex.: `pedidos-api`)

### Procedimento

1. Liste os pods no namespace com status detalhado e contagem de reinícios:
```bash
kubectl get pods -n {{namespace}} -o wide
```

2. Descreva o pod para verificar `Last State`, `Exit Code` e os eventos de ciclo de vida:
```bash
kubectl describe pod {{pod}} -n {{namespace}}
```

3. Obtenha os logs da última execução encerrada (que causou a quebra):
```bash
kubectl logs {{pod}} -n {{namespace}} --previous --tail=150
```

4. Verifique os logs da tentativa atual (caso o container ainda esteja tentando subir):
```bash
kubectl logs {{pod}} -n {{namespace}} --tail=100
```

5. Verifique eventos recentes específicos associados a este pod:
```bash
kubectl get events -n {{namespace}} --field-selector involvedObject.name={{pod}}
```

6. Caso a causa tenha sido temporária (ex.: banco fora que voltou), reinicie o deployment de forma controlada:
```bash
kubectl rollout restart deployment/{{deployment}} -n {{namespace}}
```
