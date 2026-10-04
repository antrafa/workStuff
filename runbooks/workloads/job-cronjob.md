# Job ou CronJob falhando

Rotinas agendadas falham em silêncio: ninguém está olhando quando rodam. Este runbook confirma se o CronJob está disparando, se o Job termina e por que falha.

**Quando usar:** rotina noturna não rodou, Job em `Failed`, ou acúmulo de Jobs/pods antigos no namespace.

### Antes de começar
- `namespace`, `cronjob` (nome do CronJob) e `job` (nome de uma execução, do passo 2).
- Tudo aqui é leitura.

### 1. O CronJob está agendado e disparando?
```bash
kubectl get cronjob -n {{namespace}}
```
> `SUSPEND` `True`: está suspenso. `LAST SCHEDULE` muito antigo para a frequência do `SCHEDULE`: não está disparando (passo 5). O horário do `SCHEDULE` é em **UTC**, salvo se houver `timeZone` definido.

### 2. Execuções recentes
```bash
kubectl get jobs -n {{namespace}} --sort-by=.metadata.creationTimestamp
```
> `COMPLETIONS` `0/1` com idade grande: falhou ou travou.

### 3. Por que o Job falhou
```bash
kubectl describe job {{job}} -n {{namespace}}
```
> `BackoffLimitExceeded`: o container falhou mais vezes que o `backoffLimit`. `DeadlineExceeded`: passou do `activeDeadlineSeconds` (rotina mais lenta que o previsto).

### 4. Log da execução
```bash
kubectl logs job/{{job}} -n {{namespace}} --tail=150
```
> Sem log (pod já removido): o Job guarda só os pods mais recentes. Aumente `failedJobsHistoryLimit` para investigar a próxima falha.

### 5. Eventos do CronJob
```bash
kubectl get events -n {{namespace}} --field-selector involvedObject.name={{cronjob}} --sort-by=.lastTimestamp
```
> `Cannot determine if job needs to be started: too many missed start times`: o controlador ficou fora por muito tempo; defina `startingDeadlineSeconds`. Execução pulada com `concurrencyPolicy: Forbid`: a anterior ainda estava rodando.

### Rodar de novo
Disparar uma execução manual (`kubectl create job --from=cronjob/...`) não é permitido pelo painel. Faça pelo terminal com o kubeconfig do ambiente, depois de entender a falha.
