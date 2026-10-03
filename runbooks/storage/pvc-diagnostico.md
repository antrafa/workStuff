# Diagnóstico de Storage e PVCs

Diagnóstico de PersistentVolumeClaims (PVCs) presos em status `Pending`, erros de provisionamento dinâmico ou falhas de montagem (`FailedAttachVolume` ou `FailedMount`) em pods.

### Parâmetros
- `namespace`: Namespace do PersistentVolumeClaim
- `pvc`: Nome do PVC
- `pod`: Nome do pod que consome este volume

### Procedimento

1. Liste os PersistentVolumeClaims do namespace para verificar status (`Bound`, `Pending` ou `Lost`):
```bash
kubectl get pvc -n {{namespace}}
```

2. Descreva o PVC para verificar a StorageClass solicitada, capacidade e mensagens de erro do provisioner:
```bash
kubectl describe pvc {{pvc}} -n {{namespace}}
```

3. Liste os PersistentVolumes (PVs) globais do cluster para conferir status e política de retenção:
```bash
kubectl get pv
```

4. Verifique as StorageClasses registradas no cluster e qual é a padrão (default):
```bash
kubectl get storageclass
```

5. Verifique eventos específicos gerados para o PVC no namespace:
```bash
kubectl get events -n {{namespace}} --field-selector involvedObject.kind=PersistentVolumeClaim
```

6. Inspecione o pod consumidor para checar erros de `FailedAttachVolume` ou disco ocupado por outro nó:
```bash
kubectl describe pod {{pod}} -n {{namespace}}
```
