# Saúde geral do cluster

Varredura rápida para começo de plantão, depois de manutenção ou no início de um incidente sem causa clara. Responde em poucos minutos: o control plane responde, os nós estão de pé, os componentes de sistema estão saudáveis e o que está falhando agora.

**Quando usar:** início de plantão, pós-manutenção, ou "está tudo lento" sem pista.

### Antes de começar
- Sem parâmetros. Tudo aqui é leitura.

### 1. Control plane responde
```bash
kubectl cluster-info
kubectl get --raw '/readyz?verbose'
```
> Alguma linha `[-]` no `readyz`: componente do control plane com problema (etcd, scheduler). Em cluster gerenciado (OKE, EKS, AKS), abra chamado com o provedor.

### 2. Nós
```bash
kubectl get nodes -o wide
kubectl top nodes
```
> Qualquer nó fora de `Ready`: runbook *Capacidade e pressão nos nós*. Versões de kubelet diferentes entre nós indicam upgrade pela metade.

### 3. Componentes de sistema
```bash
kubectl get pods -n kube-system -o wide
```
> CoreDNS fora derruba resolução de nomes do cluster inteiro. CNI (calico, flannel, cilium) fora derruba a rede dos pods do nó.

### 4. Tudo que não está rodando
```bash
kubectl get pods -A --field-selector 'status.phase!=Running,status.phase!=Succeeded'
```
> Agrupe por namespace: muitos pods falhando no mesmo namespace é problema da aplicação; espalhados por vários, é problema de nó ou de plataforma.

### 5. Avisos recentes do cluster
```bash
kubectl get events -A --field-selector type=Warning --sort-by=.lastTimestamp
```
> Os eventos expiram em cerca de 1 hora. Repetição do mesmo `reason` (`FailedScheduling`, `BackOff`, `Unhealthy`) aponta o runbook a seguir.
