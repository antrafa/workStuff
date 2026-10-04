# Build Maven falhando localmente

Separa as causas mais comuns de build Maven quebrado na máquina de dev: JDK errado, dependência que não resolve (repositório interno, VPN, cache corrompido) e conflito de versão entre dependências.

**Quando usar:** `mvn` falha localmente mas passa no CI, `Could not resolve dependencies`, ou `NoSuchMethodError` em tempo de teste.

### Antes de começar
- `projeto`: pasta com o `pom.xml`.
- Repositórios internos (Nexus/Artifactory) costumam exigir VPN e o `~/.m2/settings.xml` configurado.

### 1. Java e Maven em uso
```bash
mvn -v
```
> Confira a linha `Java version` contra o `maven.compiler.release`/`source` do `pom.xml`. JDK mais novo que o projeto suporta quebra plugins antigos.

### 2. Build sem testes, em modo silencioso
Isola erro de compilação e de dependência dos erros de teste.
```bash
mvn -q -DskipTests package
```
> `Could not resolve dependencies` / `Could not transfer artifact`: rede, VPN ou credencial do repositório interno. Confira o passo 3.

### 3. De onde vem cada dependência
```bash
mvn -q dependency:tree
```
> Duas versões da mesma biblioteca na árvore explicam `NoSuchMethodError`/`ClassNotFoundException`. Fixe a versão no `dependencyManagement`.

### 4. Forçar nova tentativa de download
Quando o Maven guardou uma falha de download e não tenta de novo (`was cached in the local repository, resolution will not be reattempted`):
```bash
mvn -U -DskipTests package
```

### 5. Build completo com testes
```bash
mvn clean verify
```
> Falha só aqui: é teste. Rode um teste específico com `mvn -Dtest=NomeDoTeste test` para iterar mais rápido.
