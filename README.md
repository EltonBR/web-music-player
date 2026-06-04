# Web Music Player

Player de musica mobile first feito com HTML, CSS, JavaScript puro, Web Components e backend Node.js sem bibliotecas externas.

O projeto foi pensado para rodar em rede local: o frontend e servido por um BusyBox `httpd` portatil na porta `1024`, enquanto a API REST roda em Node na porta `9192`. A URL da API pode ser configurada pela tela de configuracoes, e por padrao o frontend usa o host atual da pagina para facilitar acesso por celular na mesma rede.

## Recursos

- Player mobile first com capa placeholder, titulo da faixa, progresso, controles anterior/proximo, play/pause e volume.
- Biblioteca em arvore de diretorios.
- Selecao de um diretorio inteiro para fila de reproducao.
- Selecao de uma faixa individual.
- Lista de reproducao atual em painel separado.
- Tema claro e escuro.
- Configuracoes para mudar a URL da API.
- Persistencia local de biblioteca, fila atual, faixa atual e tempo.
- Opcao de sincronizar estado no servidor para continuar ouvindo em outro dispositivo.
- Streaming com suporte a `Range requests`, necessario para seek e reproducao eficiente no navegador.
- Sem dependencias externas de frontend ou backend.

## Arquitetura

```text
.
|-- server.js
|-- public/
|   |-- index.html
|   |-- styles.css
|   |-- assets/
|   `-- js/components/
|       |-- music-player/
|       |-- music-library/
|       |-- current-playlist/
|       `-- player-settings/
|-- music/
|-- busybox
|-- serve-frontend.sh
|-- start-server.sh
`-- stop-server.sh
```

### Backend

O backend fica em `server.js` e usa somente modulos nativos do Node:

- `http`: servidor REST e streaming.
- `fs`: leitura da biblioteca, streaming e persistencia de estado.
- `path`: normalizacao segura de caminhos.
- `url`: parsing das rotas.

Ele expoe a API, faz scan recursivo do diretorio de musicas e tambem consegue servir os arquivos estaticos de `public/`. No uso principal, porem, o frontend e servido pelo BusyBox local.

### Frontend

O frontend fica em `public/` e usa Web Components nativos:

- `music-player`: componente principal, orquestra audio, API, estado, tema e paineis.
- `music-library`: renderiza a arvore de diretorios e permite escolher diretorio ou faixa.
- `current-playlist`: mostra a fila atual e permite trocar a faixa ativa.
- `player-settings`: configura URL da API e sincronizacao de estado no servidor.

Cada componente tem CSS proprio no mesmo diretorio:

```text
public/js/components/<nome-componente>/<nome-componente>.js
public/js/components/<nome-componente>/<nome-componente>.css
```

## Portas

- Frontend: `http://localhost:1024`
- API: `http://localhost:9192`

A porta `1024` foi escolhida para evitar necessidade de root em sistemas Unix.

## Requisitos

- Node.js instalado.
- Shell POSIX para os scripts `.sh`.
- O binario `./busybox` ja esta na raiz do projeto e e usado para servir o frontend.

Nao e necessario instalar pacotes npm.

## Como Usar

Coloque seus arquivos de audio em `music/`:

```text
music/
|-- Album 1/
|   |-- 01 Faixa.mp3
|   `-- 02 Faixa.mp3
`-- Singles/
    `-- Musica.flac
```

Inicie API e frontend:

```bash
npm start
```

Acesse:

```text
http://localhost:1024
```

Para acessar pelo celular, descubra o IP da maquina na rede:

```bash
hostname -I
```

Depois abra no celular:

```text
http://<ip-da-maquina>:1024
```

Pare os servidores:

```bash
npm stop
```

## Scripts

```bash
npm start
```

Inicia API e frontend em background. Cria arquivos locais de PID e log:

- `.api-server.pid`
- `.frontend-server.pid`
- `.api-server.log`
- `.frontend-server.log`

```bash
npm stop
```

Para API e frontend usando os arquivos de PID e, como fallback, procura processos escutando nas portas configuradas.

```bash
npm run api
```

Inicia somente a API Node.

```bash
npm run frontend
```

Inicia somente o frontend com BusyBox `httpd`.

## Variaveis De Ambiente

```bash
PORT=9192
```

Define a porta da API.

```bash
FRONTEND_PORT=1024
```

Define a porta do BusyBox `httpd`.

```bash
MUSIC_DIR=/caminho/para/musicas
```

Define um diretorio externo para a biblioteca.

```bash
BUSYBOX_BIN=/caminho/para/busybox
```

Permite usar outro binario BusyBox no `serve-frontend.sh`.

Exemplo:

```bash
MUSIC_DIR=/home/elton/Musicas FRONTEND_PORT=1024 npm start
```

## API REST

### `GET /api/health`

Retorna status basico da API.

Resposta:

```json
{
  "ok": true,
  "port": 9192,
  "musicDir": "/caminho/absoluto/music"
}
```

### `GET /api/tracks`

Faz scan recursivo do diretorio de musicas e retorna as faixas encontradas.

Resposta:

```json
{
  "musicDir": "/caminho/absoluto/music",
  "tracks": [
    {
      "id": "QWxidW0vMDEgRmFpeGEubXAz",
      "title": "01 Faixa",
      "artist": "Album",
      "fileName": "01 Faixa.mp3",
      "path": "Album/01 Faixa.mp3",
      "url": "/api/tracks/Album%2F01%20Faixa.mp3"
    }
  ]
}
```

### `GET /api/tracks/:path`

Faz streaming de uma faixa. Aceita o header `Range` para seek e para reproducao parcial.

Formatos aceitos:

- `.mp3`
- `.wav`
- `.ogg`
- `.m4a`
- `.flac`
- `.aac`

### `GET /api/player-state`

Retorna o estado salvo no servidor, quando a sincronizacao esta habilitada no frontend.

### `PUT /api/player-state`

Salva o estado atual no servidor em `.player-state.json`.

Formato esperado:

```json
{
  "state": {
    "playlist": [],
    "currentTrackPath": "Album/01 Faixa.mp3",
    "currentTime": 42.5
  }
}
```

## Persistencia

O frontend salva dados no navegador para evitar perda de estado:

- cache da biblioteca em `localStorage`;
- fila de reproducao atual;
- faixa selecionada;
- tempo atual da faixa;
- tema;
- URL da API;
- preferencia de sincronizacao no servidor.

Mesmo usando cache local, a biblioteca e atualizada ao recarregar a pagina para detectar novas musicas. O estado do player tambem e salvo ao pausar, trocar de faixa, fechar a pagina e periodicamente a cada 20 segundos.

Quando a sincronizacao no servidor esta habilitada, o estado tambem e enviado para `PUT /api/player-state`, permitindo continuar em outro dispositivo que use a mesma API.

## BusyBox Portatil

O binario `./busybox` fica versionado na raiz do projeto e e usado por `serve-frontend.sh`.

O codigo fonte extraido e o tarball baixado ficam ignorados pelo Git:

```gitignore
busybox-*/
busybox-*.tar.*
```

O BusyBox local foi compilado com `httpd` habilitado. O script de frontend usa:

```bash
./busybox httpd -f -p 1024 -h public
```

## Gitignore

Arquivos locais ignorados:

- `music/`
- logs e PIDs dos servidores;
- `.player-state.json`;
- fonte e tarball do BusyBox.

O binario `busybox` nao esta no `.gitignore`, pois ele faz parte do runtime portatil do projeto.

## Seguranca De Caminhos

O backend usa resolucao segura de caminhos antes de ler arquivos. Isso evita que uma requisicao para `/api/tracks/...` ou para arquivos estaticos acesse conteudo fora dos diretorios permitidos.

## Desenvolvimento

Como nao ha bundler, transpilador ou dependencias externas, alteracoes em JS/CSS ficam disponiveis assim que a pagina e recarregada.

Para validar rapidamente os arquivos principais:

```bash
node --check server.js
sh -n serve-frontend.sh
sh -n start-server.sh
sh -n stop-server.sh
```

## Limitacoes Atuais

- Nao ha leitura de metadados ID3; titulo e artista sao derivados do nome e diretorio do arquivo.
- A capa do album ainda e placeholder.
- A sincronizacao no servidor usa um unico arquivo `.player-state.json`, entao o estado e compartilhado entre dispositivos que apontam para a mesma API.
