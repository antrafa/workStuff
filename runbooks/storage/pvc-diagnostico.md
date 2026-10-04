# Diagnóstico de storage e PVCs

Volume que não provisiona ou não monta impede o pod de subir. O caminho é *PVC → StorageClass → PV → anexo no nó → montagem no pod*, e cada etapa tem uma mensagem própria.

**Quando usar:** PVC em `Pending`, pod em `ContainerCreating` com `FailedMount`/`FailedAttachVolume`, ou PVC `Lost`.

### Antes de começar
- `namespace`, `pvc` (nome) e `pod` (que usa o volume).
- Tudo aqui é leitura.

### 1. Status dos PVCs
```bash
kubectl get pvc -n {{namespace}}
```
> `Bound`: provisionado (o problema, se houver, é montagem: passo 5). `Pending`: passo 2. `Lost`: o PV sumiu; dado provavelmente perdido, chame o time de plataforma.

### 2. Por que o PVC não vincula
```bash
kubectl describe pvc {{pvc}} -n {{namespace}}
```
| Evento | Causa |
|---|---|
| `storageclass ... not found` | StorageClass inexistente (passo 3) |
| `waiting for first consumer to be created before binding` | normal com `WaitForFirstConsumer`: só provisiona quando um pod usar |
| `ProvisioningFailed` com quota/limite | limite de volumes ou de espaço no provedor de nuvem |

### 3. StorageClasses disponíveis
```bash
kubectl get storageclass
```
> PVC sem `storageClassName` usa a marcada como `(default)`. Nenhuma default e PVC sem classe: fica `Pending` para sempre.

### 4. PVs do cluster
```bash
kubectl get pv
```
> PV `Released` não é reaproveitado automaticamente (política `Retain`). `RECLAIM POLICY` `Delete` apaga o dado junto com o PVC.

### 5. Montagem no pod
```bash
kubectl get events -n {{namespace}} --field-selector involvedObject.name={{pod}} --sort-by=.lastTimestamp
```
> `Multi-Attach error ... already used by pod`: volume `ReadWriteOnce` preso a outro nó (comum em rollout de StatefulSet ou nó que caiu). Espere o pod antigo terminar; o desanexo pode levar ~6 minutos após a queda de um nó.
> `timed out waiting for the condition` em `FailedMount`: driver CSI ou nó com problema.

### 6. Driver CSI
```bash
kubectl get csidrivers
kubectl get pods -n kube-system -o wide
```
> Pods do driver CSI (nomes com `csi`) fora de `Running` no nó do pod explicam falha de montagem.
