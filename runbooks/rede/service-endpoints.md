# Service sem endpoints ou falha de conexão interna

Chamadas para um Service falham (timeout, `connection refused`, 503) porque ele não tem pods prontos por trás, ou porque o nome não resolve. O Service só encaminha para pods que casam com o seletor **e** estão `Ready`.

**Quando usar:** um serviço não consegue chamar outro dentro do cluster, ou o Ingress devolve 503.

### Antes de começar
- `namespace`, `service`, `app` (label dos pods) e `deployment`.

### 1. Seletor e portas do Service
```bash
kubectl get svc {{service}} -n {{namespace}} -o jsonpath='{.spec.selector}{.spec.ports}'
```

### 2. Endpoints registrados
```bash
kubectl get endpoints {{service}} -n {{namespace}}
```
> Lista de IPs: o Service está ok; o problema é porta (passo 5) ou rede. `<none>`: siga para o passo 3.

### 3. Os labels dos pods casam com o seletor?
```bash
kubectl get pods -n {{namespace}} --show-labels
```
> Compare com o `selector` do passo 1, chave e valor. Erro clássico: seletor `app: pedidos-api` e pod com `app.kubernetes.io/name: pedidos-api`.

### 4. Os pods estão prontos?
```bash
kubectl get pods -n {{namespace}} -l app={{app}} -o wide
```
> `0/1` em READY: o pod roda mas a readiness falha, então fica fora do Service. Runbook *Probes falhando*.

### 5. A porta de destino é a que o container abre?
```bash
kubectl get deployment {{deployment}} -n {{namespace}} -o jsonpath='{.spec.template.spec.containers[*].ports}'
```
> O `targetPort` do Service (passo 1) precisa bater com a porta em que a aplicação escuta.

### 6. DNS do cluster
```bash
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50
```
> Nome completo de um Service: `<service>.<namespace>.svc.cluster.local`. Chamada de outro namespace com o nome curto não resolve.

### 7. Reinício (só se os pods estiverem travados)
Bloqueado em PRO.
```bash
kubectl rollout restart deployment/{{deployment}} -n {{namespace}}
```
