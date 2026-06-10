# Web Music Player

![Model Collapse Fuel](https://img.shields.io/badge/model%20collapse-fuel-blueviolet)
![AI Slop Inside](https://img.shields.io/badge/AI%20Slop-Inside-ff69b4)
![Vibe coded](https://img.shields.io/badge/vibe--coded-yes%2C%20unfortunately-orange)

Player de musica mobile first feito com HTML, CSS, JavaScript puro, Web Components e backend Node.js sem bibliotecas externas.

O projeto foi pensado para rodar em rede local: o frontend e servido por um BusyBox `httpd` portatil na porta `1024`, enquanto a API REST roda em Node na porta `9192`. A URL da API pode ser configurada pela tela de configuracoes, e por padrao o frontend usa o host atual da pagina para facilitar acesso por celular na mesma rede.

## Recursos

- Player mobile first com capa, titulo, artista, album, progresso, contador da faixa atual, controles anterior/proximo, play/pause e volume.
- Biblioteca em arvore de diretorios.
- Suporte a links simbolicos de diretorios durante o scan da biblioteca, com protecao contra ciclos.
- Selecao de um diretorio inteiro para fila de reproducao.
- Selecao de uma faixa individual.
- Lista de reproducao atual em painel separado, com indicacao da faixa ativa.
- Favoritos com botao por faixa, persistencia local, sincronizacao opcional no servidor e lista "Favoritos" no mesmo dropdown/arvore de "Todas as musicas".
- Menu de acoes da faixa atual com embaralhar playlist e excluir arquivo do disco com confirmacao.
- Shuffle da playlist atual mantendo a faixa ativa.
- Leitura de metadados ID3 para MP3, incluindo titulo, artista, album e capa embutida. Quando nao houver metadados, o app usa o comportamento anterior baseado no nome do arquivo e diretorio.
- Cache servidor dos metadados ID3 em `.cache/`, com um arquivo JSON por faixa para acelerar bibliotecas grandes ou armazenadas em NAS.
- Equalizador em Web Component proprio, com perfis predefinidos, bandas de frequencia, habilitar/desabilitar e controle independente de bass.
- Tema claro e escuro.
- Instalavel como PWA.
- Cache offline do app shell por Service Worker.
- Configuracoes para mudar a URL da API.
- Persistencia local de biblioteca, fila atual, favoritos, equalizador, tema, faixa atual e tempo.
- Opcao de sincronizar estado no servidor para continuar ouvindo em outro dispositivo, incluindo favoritos.
- Streaming com suporte a `Range requests`, necessario para seek e reproducao eficiente no navegador.
- Sem dependencias externas de frontend ou backend.

## Arquitetura

```text
.
|-- server.js
|-- server/
|   |-- index.js
|   |-- config.js
|   |-- http-utils.js
|   |-- id3.js
|   |-- metadata-cache.js
|   |-- player-state.js
|   |-- static-files.js
|   `-- tracks.js
|-- public/
|   |-- index.html
|   |-- manifest.webmanifest
|   |-- service-worker.js
|   |-- styles.css
|   |-- assets/
|   `-- js/components/
|       |-- music-player/
|       |-- music-library/
|       |-- current-playlist/
|       |-- player-controls/
|       |-- player-header/
|       |-- player-equalizer/
|       |-- track-action-menu/
|       `-- player-settings/
|-- music/
|-- .cache/
|-- busybox
|-- serve-frontend.sh
|-- start-server.sh
`-- stop-server.sh
```

### Backend

O backend fica em `server/` e usa somente modulos nativos do Node. O arquivo `server.js` permanece como wrapper de compatibilidade para `node server.js`, enquanto `start-server.sh` inicia diretamente `server/index.js`.

- `http`: servidor REST e streaming.
- `fs`: leitura da biblioteca, streaming, cache de metadados e persistencia de estado.
- `path`: normalizacao segura de caminhos.
- `crypto`: geracao de chaves estaveis para os itens de cache.
- `url`: parsing das rotas.

Ele expoe a API, faz scan recursivo do diretorio de musicas e tambem consegue servir os arquivos estaticos de `public/`. No uso principal, porem, o frontend e servido pelo BusyBox local.

Responsabilidades principais:

- `server/index.js`: cria o servidor HTTP e roteia as requisicoes.
- `server/config.js`: centraliza portas, diretorios, tipos de audio e tipos estaticos.
- `server/http-utils.js`: resposta JSON, leitura de corpo, 404 e resolucao segura de caminhos.
- `server/tracks.js`: lista biblioteca, transmite audio, retorna capas e exclui faixas.
- `server/id3.js`: faz parsing ID3v1/ID3v2 de MP3.
- `server/metadata-cache.js`: le e grava o cache de metadados em `.cache/`.
- `server/player-state.js`: le e persiste `.player-state.json`.
- `server/static-files.js`: serve arquivos de `public/` quando a API e usada tambem como servidor estatico.

Durante o scan, cada MP3 tem os metadados ID3 armazenados em `.cache/`. O servidor valida cada item pelo caminho absoluto, caminho relativo, tamanho e `mtimeMs` do arquivo. Se a faixa nao mudou, a API reutiliza o JSON em cache e evita reler as tags ID3 no NAS. Se a faixa mudar, for movida ou o formato do cache mudar, o item e recriado automaticamente.

### Frontend

O frontend fica em `public/` e usa Web Components nativos:

- `music-player`: componente principal, orquestra audio, API, estado, tema e paineis.
- `player-header`: botoes superiores para biblioteca, equalizador, tema, configuracoes e playlist atual.
- `player-controls`: controles de reproducao, favorito, menu de acoes da faixa e volume.
- `track-action-menu`: dropdown da faixa atual, com shuffle e exclusao do arquivo do disco com modal de confirmacao.
- `player-equalizer`: painel de equalizador com presets, bandas de frequencia, bass e liga/desliga.
- `music-library`: renderiza a arvore de diretorios e permite escolher diretorio ou faixa.
- `current-playlist`: mostra a fila atual e permite trocar a faixa ativa.
- `player-settings`: configura URL da API e sincronizacao de estado no servidor.

Cada componente tem CSS proprio no mesmo diretorio:

```text
public/js/components/<nome-componente>/<nome-componente>.js
public/js/components/<nome-componente>/<nome-componente>.css
```

### PWA

O projeto inclui os arquivos basicos de PWA:

- `public/manifest.webmanifest`: nome, icone, tema, escopo e modo `standalone`.
- `public/service-worker.js`: cache do app shell e limpeza de caches antigos.
- `public/js/pwa.js`: registro do Service Worker no carregamento da pagina.
- `public/assets/app-icon.svg`: icone usado pelo manifest.

O Service Worker cacheia os arquivos estaticos do frontend. Requisicoes de streaming em `/api/tracks/:path`, capas em `/api/covers/:path`, requisicoes com header `Range` e estado remoto em `/api/player-state` passam direto pela rede para evitar problemas com reproducao, seek, capas e sincronizacao.

Os caminhos do frontend sao relativos ao local onde `index.html` foi publicado. Isso permite servir o app em um subdiretorio, por exemplo `https://servidor/player/`, sem quebrar CSS, modulos JavaScript, manifest, icones ou Service Worker.

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

No navegador mobile, use a opcao de instalar/adicionar a tela inicial. Depois de instalado, o app abre em modo standalone.

Observacao tecnica: Service Worker exige contexto seguro. Em `localhost`, HTTP e aceito pelos navegadores. Em outro dispositivo da rede, como um celular acessando `http://<ip-da-maquina>:1024`, o navegador pode bloquear o registro do Service Worker e a instalacao PWA ate que o frontend seja servido por HTTPS.

Pare os servidores:

```bash
npm stop
```

## Scripts

```bash
npm start
```

Inicia API e frontend em background. A API e iniciada pelo entrypoint modular `server/index.js`. Cria arquivos locais de PID e log:

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

Inicia somente a API Node pelo wrapper `server.js`, que carrega o servidor modular.

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

Faz scan recursivo do diretorio de musicas e retorna as faixas encontradas. Links simbolicos de diretorios sao seguidos e ciclos sao ignorados.

Para arquivos MP3, os metadados ID3 sao lidos do cache em `.cache/` quando possivel. Na primeira leitura, ou quando o arquivo muda, o servidor relera as tags ID3 e atualizara o item de cache correspondente.

Resposta:

```json
{
  "musicDir": "/caminho/absoluto/music",
  "tracks": [
    {
      "id": "QWxidW0vMDEgRmFpeGEubXAz",
      "title": "01 Faixa",
      "artist": "Album",
      "album": "",
      "fileName": "01 Faixa.mp3",
      "path": "Album/01 Faixa.mp3",
      "url": "/api/tracks/Album%2F01%20Faixa.mp3",
      "coverUrl": "",
      "metadata": {
        "title": false,
        "artist": false,
        "album": false,
        "cover": false
      }
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

### `DELETE /api/tracks/:path`

Exclui a faixa do disco. A rota valida o caminho e a extensao antes de chamar `unlink`.

Resposta:

```json
{
  "ok": true,
  "path": "Album/01 Faixa.mp3"
}
```

### `GET /api/covers/:path`

Retorna a capa embutida em uma tag ID3 de um arquivo MP3, quando existir.

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
    "currentTime": 42.5,
    "favorites": {
      "paths": ["Album/01 Faixa.mp3"]
    }
  }
}
```

## Persistencia

O frontend salva dados no navegador para evitar perda de estado:

- cache da biblioteca em `localStorage`;
- fila de reproducao atual;
- favoritos;
- equalizador;
- faixa selecionada;
- tempo atual da faixa;
- tema;
- URL da API;
- preferencia de sincronizacao no servidor.

Mesmo usando cache local, a biblioteca e atualizada ao recarregar a pagina para detectar novas musicas. O estado do player tambem e salvo ao pausar, trocar de faixa, fechar a pagina e periodicamente a cada 20 segundos.

Quando a sincronizacao no servidor esta habilitada, o estado tambem e enviado para `PUT /api/player-state`, permitindo continuar em outro dispositivo que use a mesma API. O arquivo `.player-state.json` tambem guarda os favoritos sincronizados.

O backend tambem mantem cache local de metadados em `.cache/`. Cada faixa gera um arquivo JSON proprio com a assinatura do arquivo e os metadados usados pela listagem. Esse cache pode ser apagado manualmente com o servidor parado; ele sera reconstruido no proximo `GET /api/tracks`.

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
- `.cache/`;
- logs e PIDs dos servidores;
- `.player-state.json`;
- fonte e tarball do BusyBox.

O binario `busybox` nao esta no `.gitignore`, pois ele faz parte do runtime portatil do projeto.

## Seguranca De Caminhos

O backend usa resolucao segura de caminhos antes de ler, transmitir ou excluir arquivos. Isso evita que uma requisicao para `/api/tracks/...`, `/api/covers/...` ou para arquivos estaticos acesse conteudo fora dos diretorios permitidos.

## Desenvolvimento

Como nao ha bundler, transpilador ou dependencias externas, alteracoes em JS/CSS ficam disponiveis assim que a pagina e recarregada.

Para validar rapidamente os arquivos principais:

```bash
node --check server.js
for file in server/*.js; do node --check "$file" || exit 1; done
node --check public/service-worker.js
node --check public/js/pwa.js
sh -n serve-frontend.sh
sh -n start-server.sh
sh -n stop-server.sh
```

## Limitacoes Atuais

- A leitura de metadados ID3 e focada em MP3. Para outros formatos, titulo e artista continuam sendo derivados do nome e diretorio do arquivo.
- A capa do album usa placeholder quando o MP3 nao tem imagem embutida ou quando o formato nao fornece capa pela API.
- A sincronizacao no servidor usa um unico arquivo `.player-state.json`, entao o estado e compartilhado entre dispositivos que apontam para a mesma API.
- O PWA usa icone SVG; alguns navegadores antigos podem exigir PNG para instalacao.
