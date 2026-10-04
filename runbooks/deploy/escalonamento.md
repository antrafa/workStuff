# Escalonamento de emergência

Muda o número de réplicas de um deployment para absorver pico de carga ou aliviar uma dependência sobrecarregada. Antes, confirma o que pode desfazer a mudança sozinho: um HPA.

**Quando usar:** latência ou erro subindo por carga, e mais réplicas resolvem (a aplicação escala horizontalmente e o gargalo não é o banco).

**Não resolve:** gargalo no banco ou em serviço externo. Mais réplicas só aumentam a pressão sobre ele.

### Antes de começar
- `namespace`, `app` (label), `deployment` e `replicas` (número desejado).
- `scale` é bloqueado em PRO pelo painel.

### 1. Estado atual
```bash
kubectl get deployment {{deployment}} -n {{namespace}}
kubectl top pods -n {{namespace}} -l app={{app}}
```
> CPU dos pods perto do limite: mais réplicas ajudam. CPU baixa com latência alta: o gargalo está fora (banco, rede); escalar não resolve.

### 2. Existe HPA controlando este deployment?
```bash
kubectl get hpa -n {{namespace}}
```
> **Se existir**, o HPA desfaz o `scale` manual em segundos. Ajuste `minReplicas` do HPA no manifest em vez de escalar o deployment (runbook *HPA não escala*).

### 3. Há capacidade nos nós para as réplicas novas?
```bash
kubectl top nodes
```
> Nós quase cheios: as réplicas novas ficam `Pending`. Escalar sem capacidade não ajuda.

### 4. Escale
```bash
kubectl scale deployment/{{deployment}} --replicas={{replicas}} -n {{namespace}}
```

### 5. Acompanhe
```bash
kubectl rollout status deployment/{{deployment}} -n {{namespace}} --timeout=180s
kubectl get pods -n {{namespace}} -l app={{app}} -o wide
```
> Réplicas novas em `Pending`: runbook *Pod preso em Pending*. Todas no mesmo nó: falta `podAntiAffinity`/`topologySpreadConstraints`; uma queda do nó leva tudo.

### Depois do pico
O `scale` manual não volta sozinho. Registre o valor original (passo 1) e volte quando a carga normalizar, ou leve o novo valor para o manifest: o próximo deploy sobrescreve o número de réplicas com o que está lá.
