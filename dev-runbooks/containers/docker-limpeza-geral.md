# Liberar espaço em disco do Docker

Recupera espaço removendo o que o Docker acumula sem uso: containers parados, imagens sem tag e cache de build. **Não** remove volumes, que guardam dados de banco.

**Quando usar:** disco cheio, `no space left on device` no build, ou o Docker Desktop reclamando de espaço.

### Antes de começar
- Comandos globais do Docker: não precisam de `projeto`.
- Containers parados de projetos que você ainda usa serão removidos; os dados em volumes ficam.

### 1. Para onde foi o espaço
```bash
docker system df
```
> A coluna *RECLAIMABLE* diz quanto cada categoria libera. *Build Cache* costuma ser o maior em máquina de dev.

### 2. Containers parados
```bash
docker ps -a --filter status=exited
```

### 3. Imagens sem tag (sobras de build)
```bash
docker images -f dangling=true
```

### 4. Remova containers parados
```bash
docker container prune -f
```

### 5. Remova imagens sem tag
```bash
docker image prune -f
```

### 6. Remova cache de build
O próximo build será mais lento (refaz as camadas).
```bash
docker builder prune -f
```

### 7. Confirme o espaço recuperado
```bash
docker system df
```
> *Volumes* ainda grande? Liste com `docker volume ls` e remova um a um, sabendo de qual projeto é. Evite `docker volume prune`: apaga dados de banco de projetos parados.
