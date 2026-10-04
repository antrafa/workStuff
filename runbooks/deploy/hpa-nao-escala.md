# HPA não escala (ou escala demais)

O HorizontalPodAutoscaler decide o número de réplicas pela métrica (normalmente CPU em % do **request**). Quando ele não reage, a causa é quase sempre uma de três: não há métrica, o request não está definido, ou ele já está no máximo.

**Quando usar:** carga alta e réplicas paradas, `TARGETS` mostrando `<unknown>`, ou réplicas oscilando sem parar.

### Antes de começar
- `namespace`, `hpa` (nome do HPA, do passo 1), `app` (label) e `deployment`.
- Tudo aqui é leitura; ajuste de HPA é feito no manifest.

### 1. Estado do HPA
```bash
kubectl get hpa -n {{namespace}}
```
> `TARGETS` `<unknown>/70%`: sem métrica (passos 3 e 4). `REPLICAS` igual a `MAXPODS`: está no teto; aumente `maxReplicas`.

### 2. O que o HPA diz sobre a decisão
```bash
kubectl describe hpa {{hpa}} -n {{namespace}}
```
> Leia as *Conditions*: `AbleToScale`, `ScalingActive` (falso quando falta métrica) e `ScalingLimited` (preso em min/max). Os eventos mostram cada mudança de réplicas e o motivo.

### 3. O deployment tem request de CPU/memória?
```bash
kubectl get deployment {{deployment}} -n {{namespace}} -o jsonpath='{.spec.template.spec.containers[*].resources.requests}'
```
> Sem `requests.cpu`, o HPA não calcula porcentagem de CPU e fica `<unknown>`. Lembre: 70% de alvo é 70% do request, não do limite.

### 4. O metrics-server está respondendo?
```bash
kubectl top pods -n {{namespace}} -l app={{app}}
kubectl get pods -n kube-system -l k8s-app=metrics-server
```
> `error: Metrics API not available`: o metrics-server está fora; nenhum HPA do cluster funciona.

### Decisão
- Sem métrica: corrija o metrics-server ou defina `requests`.
- No teto: aumente `maxReplicas` (confira capacidade dos nós antes).
- Oscilando: aumente a janela de estabilização (`behavior.scaleDown.stabilizationWindowSeconds`).
