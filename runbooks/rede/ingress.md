# Erro HTTP no Ingress (404, 502, 503, 504)

Cada código aponta para uma camada diferente do caminho *usuário → controlador de ingress → Service → pod*. Identificar o código antes de investigar corta metade do trabalho.

**Quando usar:** acesso externo à aplicação devolve erro, mas os pods parecem saudáveis.

| Código | Onde costuma estar |
|---|---|
| 404 | nenhuma regra do Ingress casou com host/caminho, ou `ingressClassName` errado |
| 502 | o controlador alcançou o pod, mas a conexão falhou (porta errada, app derrubou a conexão) |
| 503 | o Service não tem nenhum pod pronto (endpoints vazios) |
| 504 | o pod demorou mais que o timeout do controlador |

### Antes de começar
- `namespace`, `ingress` (nome) e `service` (backend do Ingress, do passo 2).
- Tudo aqui é leitura.

### 1. Ingress, hosts e endereço
```bash
kubectl get ingress -n {{namespace}}
```
> `ADDRESS` vazio: nenhum controlador assumiu este Ingress. Confira a `CLASS` contra o passo 5.

### 2. Regras: host, caminho e backend
```bash
kubectl describe ingress {{ingress}} -n {{namespace}}
```
> Confira se o host bate **exatamente** com a URL acessada e se cada backend aponta para Service e porta que existem. `<error: endpoints ... not found>` ao lado do backend: Service errado ou sem pods.

### 3. O Service do backend tem pods prontos? (503)
```bash
kubectl get endpoints {{service}} -n {{namespace}}
```
> `<none>`: runbook *Service sem endpoints*.

### 4. Porta do Service x porta do container (502)
```bash
kubectl get svc {{service}} -n {{namespace}} -o jsonpath='{.spec.ports}'
```
> O `targetPort` precisa ser a porta em que o container escuta. Ingress apontando para `port: 80` com `targetPort` errado gera 502.

### 5. Classes de ingress disponíveis
```bash
kubectl get ingressclass
```

### 6. Log do controlador (ingress-nginx)
```bash
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx --tail=100
```
> `upstream timed out`: 504, aumente o timeout por anotação ou investigue lentidão. `connect() failed (111: Connection refused)`: 502, porta errada ou app caindo. Controlador em outro namespace: ajuste o `-n`.

### 7. Avisos do namespace
```bash
kubectl get events -n {{namespace}} --field-selector type=Warning --sort-by=.lastTimestamp
```
