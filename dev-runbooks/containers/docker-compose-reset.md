# Reset de Docker Compose Local

Procedimento para parar, limpar e reiniciar o conjunto de containers de desenvolvimento local mantidos com Docker Compose.

### Parâmetros
- `projeto`: Diretório contendo o arquivo `docker-compose.yml` (ou `compose.yaml`)

### Procedimento

1. Verifique o status atual de cada serviço definido no Compose:
```bash
docker compose ps
```

2. Consulte as últimas linhas de log para identificar serviços com falha ou erro de inicialização:
```bash
docker compose logs --tail=50
```

3. Pare e remova os containers e redes locais:
```bash
docker compose down
```

4. Suba todos os serviços em segundo plano:
```bash
docker compose up -d
```

5. Confirme que todos os containers estão com status `healthy` ou `running`:
```bash
docker compose ps
```
