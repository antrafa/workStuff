# Reset do ambiente Docker Compose local

Para, remove e sobe de novo os containers de desenvolvimento definidos no Compose, verificando antes o motivo da falha para não reiniciar às cegas.

**Quando usar:** serviço local fora do ar, banco de desenvolvimento travado, ou mudança no `docker-compose.yml`/`.env` que não foi aplicada.

### Antes de começar
- `projeto`: pasta com o `docker-compose.yml` (ou `compose.yaml`).
- `servico`: nome de um serviço do Compose (passo 3 e 6). Veja a lista no passo 1.

### 1. Estado de cada serviço
```bash
docker compose ps -a
```
> `Exited (1)` ou `Restarting`: o serviço caiu; leia o log antes de reiniciar. `unhealthy`: subiu mas o healthcheck falha.

### 2. A configuração está válida?
```bash
docker compose config --quiet
```
> Sem saída: válida. Erro aqui explica por que `up` não aplica as mudanças (variável do `.env` faltando, indentação).

### 3. Log do serviço com problema
```bash
docker compose logs --tail=80 {{servico}}
```
> Mensagens comuns: `address already in use` (porta ocupada por outro processo), `password authentication failed` (volume antigo com outra senha), `connection refused` para outro serviço (dependência ainda subindo).

### 4. Pare e remova containers e rede
Volumes (dados de banco) são **preservados**. Para zerar o banco, seria `down -v`, que apaga os dados.
```bash
docker compose down
```

### 5. Suba de novo
`--build` refaz imagens locais cujo Dockerfile mudou.
```bash
docker compose up -d --build
```

### 6. Confirme
```bash
docker compose ps
docker compose logs --tail=30 {{servico}}
```
> Todos `running`/`healthy`. Continua caindo: runbook *Container que não sobe*.
