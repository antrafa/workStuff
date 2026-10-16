# Requisições HTTP

Chama um endpoint e mostra a resposta, sem abrir o Postman nem montar o curl à mão: você guarda as requisições que repete, troca de ambiente com um clique e cola o curl que copiou do navegador.

## Quando usar

- Você quer testar se o endpoint `/health` da sua aplicação responde depois de subir a versão nova.
- Você abriu um túnel para um serviço do cluster em [Serviços locais](/servicos) e quer chamar `http://127.0.0.1:8080/api/pedidos`.
- Um colega mandou um comando `curl` e você quer repetir a chamada e ler a resposta formatada.
- Você chama o mesmo endpoint em HML e em PRO e só o endereço e o token mudam.

Alguns termos desta página:

- **Endpoint** é o endereço que a aplicação atende, por exemplo `https://api.exemplo.com/v1/pedidos`.
- **Método** diz o que a chamada faz: `GET` lê, `POST` cria, `PUT` e `PATCH` alteram, `DELETE` apaga.
- **Cabeçalho** é uma informação que vai junto com a chamada, como `Authorization: Bearer <token>`.
- **Ambiente** é um conjunto de valores com nome (por exemplo HML), usados na requisição como `{{base}}` ou `{{token}}`.

## Conhecendo a tela

- **Salvas**, à esquerda: as requisições guardadas, agrupadas pelo **Grupo** que você deu. O método aparece em cor: verde lê, amarelo altera, vermelho apaga. **Nova** começa uma requisição em branco.
- **Linha do endereço**: o método, a URL e o botão **Enviar**. Enter no campo do endereço também envia.
- **Ambiente**: a lista ao lado de **Ambientes** escolhe de onde vêm os valores de `{{variável}}`. A tela lembra o último escolhido.
- **Importar curl** e **Copiar como curl**: trazem um comando curl para a tela e levam a requisição atual de volta, já com os valores do ambiente.
- **Nome**, **Grupo**, **Salvar**, **Duplicar** e a lixeira: guardam, copiam e excluem a requisição.
- **Cabeçalhos** e **Corpo**: um cabeçalho por linha no formato `Nome: valor`. Uma linha que começa com `#` fica de fora, o que serve para desligar um cabeçalho sem apagá-lo.
- **Resposta**: o código (verde para 2xx, azul para 3xx, amarelo para 4xx, vermelho para 5xx), o tempo, o tamanho e o corpo. Se o corpo for JSON, ele aparece formatado.

## Passo a passo: chamar um endpoint

1. Escolha o método, por exemplo `GET`.
2. Digite a URL, por exemplo `http://127.0.0.1:8080/actuator/health`.
3. Se precisar, abra **Cabeçalhos** e escreva, por exemplo, `Accept: application/json`.
4. Clique em **Enviar**.
5. Leia a resposta embaixo. **Cabeçalhos** mostra os cabeçalhos que voltaram e **Copiar corpo** copia o texto.

### Guardar uma requisição

1. Preencha **Nome** (por exemplo `Saúde do pedidos`) e, se quiser, **Grupo** (por exemplo `pedidos-api`).
2. Clique em **Salvar nova**. Ela aparece em **Salvas**.
3. Depois de mudar algo numa requisição salva, clique em **Salvar**. O botão só fica ativo quando há alteração.

### Usar o mesmo endpoint em HML e PRO

1. Clique em **Ambientes** e depois em **Novo ambiente**.
2. Dê o nome `HML` e escreva uma variável por linha, por exemplo `base=https://pedidos-hml.exemplo.com` e `token=abc123`.
3. Crie o ambiente `PRO` do mesmo jeito, com os valores de produção, e clique em **Salvar**.
4. Na requisição, use `{{base}}/v1/pedidos` na URL e `Authorization: Bearer {{token}}` nos cabeçalhos.
5. Escolha o ambiente na lista e clique em **Enviar**. Para trocar de ambiente, só troque a escolha na lista.

### Importar um curl

1. No navegador, abra o DevTools, vá à aba **Network**, clique com o botão direito na chamada e escolha **Copy** e depois **Copy as cURL (bash)**.
2. No painel, clique em **Importar curl**, cole o comando e clique em **Importar**.
3. O método, a URL, os cabeçalhos e o corpo vão para a tela. Dê um nome e salve, se quiser guardar.

## Bom saber

- A chamada sai do servidor local do painel, não do navegador. Por isso não existe bloqueio de CORS, e um túnel aberto em 127.0.0.1 funciona.
- Os cabeçalhos e as variáveis podem ter token. Eles ficam no arquivo `http-requests.json` da sua pasta de dados, que só o seu usuário consegue ler.
- O painel não ignora certificado TLS inválido. Se o servidor usar um certificado que a máquina não reconhece, a chamada falha com uma mensagem dizendo isso.
- Uma resposta maior que 5 MB é cortada. Uma resposta binária (imagem, PDF) mostra só o tamanho e os cabeçalhos.
- A chamada desiste depois de 60 segundos sem resposta.

## Problemas comuns

- **"nada escutando em ... (conexão recusada)".** A aplicação não está no ar nessa porta. Se for um serviço do cluster, abra um túnel em [Serviços locais](/servicos).
- **"O ambiente não tem valor para: token".** A requisição usa `{{token}}`, mas o ambiente escolhido não tem essa variável. Abra **Ambientes** e acrescente a linha `token=...`.
- **"o nome ... não resolve (DNS)".** Confira o endereço e se a VPN está ligada.
- **"cabeçalho inválido".** O nome do cabeçalho tem espaço ou outro caractere que o HTTP não aceita. Confira a linha `Nome: valor`.
