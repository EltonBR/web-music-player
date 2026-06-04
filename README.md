# Web Music Player

Player de musica mobile first feito com HTML, CSS, JavaScript puro, Web Components e backend Node sem bibliotecas externas.

## Como executar

Coloque arquivos de audio em `music/` ou informe outro diretorio com `MUSIC_DIR`.

API e frontend:

```bash
npm start
```

Parar servidores:

```bash
npm stop
```

Com outro diretorio:

```bash
MUSIC_DIR=/caminho/para/musicas npm start
```

Frontend com BusyBox:

```bash
npm run frontend
```

Por padrao o script integrado usa a porta `1024` para o frontend. Para usar `1000`, alguns sistemas exigem permissao elevada:

```bash
sudo FRONTEND_PORT=1000 sh ./start-server.sh
```

Acesse o frontend:

```text
http://localhost:1024
```

A API continua em `http://localhost:9192`.

## API

- `GET /api/health`: status do servidor.
- `GET /api/tracks`: lista os audios encontrados no diretorio.
- `GET /api/tracks/:path`: reproduz o arquivo de audio com suporte a range requests.

Formatos aceitos: `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, `.aac`.

## Biblioteca

A biblioteca monta uma arvore com base nos subdiretorios encontrados. Ao escolher um diretorio, o player cria uma fila com todas as faixas dentro dele. Ao escolher uma faixa, apenas ela e carregada para reproducao.

## Componentes

Os Web Components ficam em `public/js/components/`:

- `music-player`: player principal e orquestracao da API/audio.
- `music-library`: arvore de diretorios da biblioteca.
- `current-playlist`: lista de reproducao atual.

Cada componente tem seu proprio arquivo `.css` no mesmo diretorio.
