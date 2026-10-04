# Container que não sobe ou reinicia em loop

Descobre por que um container local morre logo após subir, lendo o código de saída e o log da última execução em vez de reiniciar repetidamente.

**Quando usar:** container em `Restarting`, `Exited (1)`, `Exited (137)`, ou que sobe e cai em segundos.

### Antes de começar
- `container`: nome ou id do container (coluna *NAMES* do passo 1).
- Comandos globais do Docker: não precisam de `projeto`.

### 1. Estado e código de saída
```bash
docker ps -a --filter name={{container}}
```
| Saída | Significado provável |
|---|---|
| `Exited (0)` | o processo terminou normalmente: o comando do container não fica rodando |
| `Exited (1)` | erro da aplicação: veja o log |
| `Exited (137)` | morto por falta de memória (OOM) ou por `docker kill` |
| `Exited (139)` | falha de segmentação: imagem incompatível com a arquitetura (ARM x x86) |
| `Exited (127)` | comando de entrada não encontrado na imagem |

### 2. Log da última execução
```bash
docker logs --tail=100 {{container}}
```

### 3. Detalhes do estado
```bash
docker inspect --format '{{json .State}}' {{container}}
```
> `"OOMKilled": true` confirma memória. `"Error"` traz a mensagem do runtime (porta, volume, permissão).

### 4. Configuração que o container recebeu
```bash
docker inspect {{container}}
```
> Confira `Env` (variável faltando), `Mounts` (pasta montada que não existe no host) e `HostConfig.PortBindings` (porta já usada por outro processo).

### 5. Uso de recursos dos containers vivos
```bash
docker stats --no-stream
```

### Próximo passo
- Erro de configuração: corrija o `.env`/Compose e use *Reset do ambiente Docker Compose local*.
- `137` com OOM: aumente a memória do Docker Desktop ou o `mem_limit` do serviço.
