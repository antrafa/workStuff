# Configuração da aplicação: variáveis e ConfigMaps

Confere qual configuração o pod **realmente** recebeu. Uma mudança em ConfigMap não chega a pods já rodando quando vira variável de ambiente; só chega depois de reiniciar.

**Quando usar:** a aplicação se comporta como se a configuração não tivesse mudado, aponta para o banco/URL errado, ou falha com variável ausente.

### Antes de começar
- `namespace`, `deployment`, `configmap` (nome, do passo 2) e `pod`.
- O painel nunca lê Secrets. Variáveis vindas de Secret aparecem só como referência (`secretKeyRef`), sem o valor.

### 1. De onde vêm as variáveis do container
```bash
kubectl get deployment {{deployment}} -n {{namespace}} -o jsonpath='{.spec.template.spec.containers[*].env}'
kubectl get deployment {{deployment}} -n {{namespace}} -o jsonpath='{.spec.template.spec.containers[*].envFrom}'
```
> `configMapKeyRef`/`configMapRef`: vem de ConfigMap. `secretKeyRef`/`secretRef`: vem de Secret (confira fora do painel).

### 2. ConfigMaps do namespace e quando mudaram
```bash
kubectl get configmap -n {{namespace}}
```

### 3. Conteúdo do ConfigMap
```bash
kubectl describe configmap {{configmap}} -n {{namespace}}
```

### 4. O pod é mais antigo que a mudança?
```bash
kubectl get pod {{pod}} -n {{namespace}} -o jsonpath='{.status.startTime}'
kubectl get configmap {{configmap}} -n {{namespace}} -o jsonpath='{.metadata.managedFields[*].time}'
```
> Pod iniciado **antes** da última alteração do ConfigMap: ele está com o valor antigo. Variável de ambiente nunca atualiza sozinha; arquivo montado de ConfigMap atualiza em até ~1 minuto, mas a aplicação precisa reler.

### 5. Aplicar a configuração nova
Bloqueado em PRO.
```bash
kubectl rollout restart deployment/{{deployment}} -n {{namespace}}
kubectl rollout status deployment/{{deployment}} -n {{namespace}} --timeout=120s
```
