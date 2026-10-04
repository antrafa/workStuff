# Preparar manutenção de nó

Avalia, antes de esvaziar um nó (patch de SO, troca de VM, upgrade), se a saída dos pods vai derrubar alguma aplicação. O esvaziamento em si (`cordon`/`drain`) **não** roda pelo painel em nenhum ambiente; este runbook prepara a decisão.

**Quando usar:** antes de qualquer manutenção planejada que reinicie ou remova um nó.

### Antes de começar
- `node`: nome do nó que vai sair.
- Tudo aqui é leitura.

### 1. O que roda no nó
```bash
kubectl get pods -A --field-selector spec.nodeName={{node}} -o wide
```
> DaemonSets (um pod por nó) são ignorados pelo drain. Atenção aos pods sem dono (sem Deployment/StatefulSet): eles **não** voltam em outro nó.

### 2. Aplicações com uma réplica só
```bash
kubectl get deployments -A
kubectl get statefulsets -A
```
> Toda aplicação com `1/1` que tem pod neste nó fica fora do ar durante a troca. Avise ou escale antes.

### 3. PodDisruptionBudgets
```bash
kubectl get pdb -A
```
> `ALLOWED DISRUPTIONS` `0` faz o drain esperar para sempre por aquela aplicação. Resolva antes (mais réplicas) em vez de forçar.

### 4. Capacidade para absorver os pods
```bash
kubectl top nodes
```
> Os outros nós precisam ter folga de *requests* para os pods do nó que sai, senão eles ficam `Pending`.

### 5. Volumes locais
```bash
kubectl get pv
```
> PVs com afinidade de nó (local storage) prendem o pod àquele nó: o pod não sobe em outro lugar.

### Execução (fora do painel, com o kubeconfig do ambiente)
```text
kubectl cordon <nó>
kubectl drain <nó> --ignore-daemonsets --delete-emptydir-data --timeout=10m
# ...manutenção...
kubectl uncordon <nó>
```
