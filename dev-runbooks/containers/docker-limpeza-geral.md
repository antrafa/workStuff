# Limpeza de Recursos Órfãos do Docker

Procedimento para inspecionar e recuperar espaço em disco removendo containers parados, redes órfãs e imagens dangling que acumulam no daemon local.

### Procedimento

1. Analise o espaço em disco consumido por imagens, containers e volumes:
```bash
docker system df
```

2. Liste containers em estado encerrado (exited):
```bash
docker ps -a --filter status=exited
```

3. Liste imagens locais órfãs sem tag associada:
```bash
docker images -f dangling=true
```

4. Remova todos os containers parados e libere os recursos associados:
```bash
docker container prune -f
```

5. Remova imagens dangling para recuperar espaço de armazenamento:
```bash
docker image prune -f
```

6. Verifique o espaço em disco recuperado após a limpeza:
```bash
docker system df
```
