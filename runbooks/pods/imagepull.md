# Falha ao baixar imagem (ImagePullBackOff / ErrImagePull)

O nó não conseguiu baixar a imagem do container. São três causas, e a mensagem do evento diz qual: a imagem/tag não existe, falta credencial para o registry, ou o nó não alcança o registry.

**Quando usar:** status `ImagePullBackOff`, `ErrImagePull` ou `InvalidImageName`.

### Antes de começar
- `namespace`, `pod` e `deployment`.
- O painel nunca lê Secrets; para conferir a credencial do registry, só o **nome** dela aparece aqui.

### 1. Pods afetados e em quais nós
```bash
kubectl get pods -n {{namespace}} -o wide
```
> Falha só nos pods de um nó: problema de rede ou disco daquele nó. Em todos: imagem ou credencial.

### 2. A mensagem exata do kubelet
```bash
kubectl get events -n {{namespace}} --field-selector involvedObject.name={{pod}} --sort-by=.lastTimestamp
```
| Mensagem contém | Causa | O que fazer |
|---|---|---|
| `not found`, `manifest unknown` | tag não existe no registry | confira a tag gerada pelo pipeline |
| `unauthorized`, `denied`, `authentication required` | sem credencial ou credencial vencida | renove o Secret de registry (fora do painel) |
| `i/o timeout`, `no such host`, `connection refused` | o nó não alcança o registry | rede, proxy ou DNS do nó |
| `toomanyrequests` | limite de download do Docker Hub | use registry próprio ou credencial |
| `InvalidImageName` | nome com maiúscula, espaço ou tag vazia | corrija o manifest |

### 3. Imagem declarada no deployment
```bash
kubectl get deployment {{deployment}} -n {{namespace}} -o jsonpath='{.spec.template.spec.containers[*].image}'
```
> Tag `latest` ou vazia é armadilha: o nó pode ter uma versão em cache e outro não.

### 4. Credencial de registry associada
```bash
kubectl get deployment {{deployment}} -n {{namespace}} -o jsonpath='{.spec.template.spec.imagePullSecrets}'
kubectl get serviceaccount default -n {{namespace}} -o jsonpath='{.imagePullSecrets}'
```
> Ambos vazios com registry privado: falta configurar `imagePullSecrets`.

### 5. Depois de corrigir a tag ou a credencial
Bloqueado em PRO.
```bash
kubectl rollout restart deployment/{{deployment}} -n {{namespace}}
kubectl rollout status deployment/{{deployment}} -n {{namespace}} --timeout=120s
```
