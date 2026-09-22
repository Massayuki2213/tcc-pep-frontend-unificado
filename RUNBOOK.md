# Runbook — coleta de dados numa máquina nova

Procedimento para reproduzir a campanha completa de benchmarking em outra
máquina, conforme a seção 4.6 do TCC (replicação em perfis de hardware
distintos).

Tempo total: ~30 min de preparação + ~2h de coleta desacompanhada.

---

## 1. Pré-requisitos

| Item | Mínimo | Por quê |
|---|---|---|
| Docker Desktop | **4 CPU / 6 GB** na VM | Cada stack reserva 4 CPU / 3 GB. Abaixo disso o limite do compose deixa de ser o gargalo e a máquina passa a ser — a medição não fica comparável. |
| Node.js | 20+ | Orquestrador e scripts de análise |
| Git | qualquer | Clonar os três repositórios |
| Disco | ~8 GB | Imagens Docker + volumes dos bancos |

Conferir a VM do Docker antes de qualquer coisa:

```bash
docker info --format "{{.NCPU}} CPU / {{.MemTotal}} bytes"
```

Se der menos de 4 CPU, ajustar em **Docker Desktop → Settings → Resources**.
A campanha se recusa a rodar abaixo disso (é possível forçar com `--forcar`,
mas os dados não serão comparáveis com os da outra máquina).

---

## 2. Clonar os repositórios

O orquestrador procura as stacks a partir da pasta acima do frontend. Os três
repositórios precisam ser irmãos:

```
<pasta-raiz>/
├── tcc-pep-frontend/              (front + orquestrador + laboratório)
├── tcc-pep-backend-monolito/
└── tcc-pep-backend-microsservicos/
```

```bash
mkdir tcc-pep && cd tcc-pep
git clone https://github.com/Massayuki2213/tcc-pep-frontend-unificado.git tcc-pep-frontend
git clone https://github.com/leorossiio/tcc-pep-backend-monolito.git
git clone https://github.com/leorossiio/tcc-pep-backend-microsservicos.git
```

Outro layout também funciona, desde que se aponte explicitamente:

```bash
export BACKEND_DIR=/caminho/para/tcc-pep-backend-monolito
export MS_DIR=/caminho/para/tcc-pep-backend-microsservicos
```

---

## 3. Configurar os `.env`

Os `.env` **não são versionados** (contêm senhas). Cada backend traz um
`.env.example` com todas as variáveis que o `docker-compose.yml` exige:

```bash
cd tcc-pep-backend-monolito       && cp .env.example .env && cd ..
cd tcc-pep-backend-microsservicos && cp .env.example .env && cd ..
```

Os valores de exemplo servem para o benchmark — são bancos locais e
descartáveis. Basta garantir que as senhas não fiquem vazias.

---

## 4. Dar um nome à máquina

**Este passo não é opcional.** Toda observação é carimbada com a máquina de
origem. Sem um apelido legível, o acervo fica com o hostname cru e a análise
não consegue distinguir as duas coletas.

```bash
# Linux/macOS
export MAQUINA="desktop-felipe"

# Windows PowerShell
$env:MAQUINA = "desktop-felipe"
```

Use um nome que identifique a máquina no relatório — ele vai aparecer na
coluna `maquina` do dataset e nas tabelas do capítulo de resultados.

---

## 5. Subir as duas stacks

```bash
cd tcc-pep-backend-monolito       && docker compose up -d --build && cd ..
cd tcc-pep-backend-microsservicos && docker compose up -d --build && cd ..
```

A primeira subida compila as imagens e leva de 5 a 10 minutos.

Conferir que tudo respondeu:

```bash
curl -s -o /dev/null -w "monolito:  %{http_code}\n" http://localhost:3000/medicos
curl -s -o /dev/null -w "gateway MS: %{http_code}\n" http://localhost:4000/medicos
```

Os dois precisam devolver **200**.

> O front (`frontend-pep`) está sob o profile `frontend` e **não sobe junto**,
> de propósito: ele não participa da medição e consumiria recursos do orçamento.
> Para usá-lo: `docker compose --profile frontend up -d`.

---

## 6. Subir o orquestrador

Numa janela de terminal separada, dentro do frontend:

```bash
cd tcc-pep-frontend
npm install
npm run orchestrator
```

A saída confirma o que ele encontrou:

```
Orquestrador k6 em http://localhost:3333
Stack monolito        ✓ .../tcc-pep-backend-monolito
Stack microsservicos  ✓ .../tcc-pep-backend-microsservicos
Laboratório (acervo): .../laboratorio
Máquina:              desktop-felipe — 8 CPU / 15.9 GB (Docker: 8 CPU / 7.7 GB)
```

Se alguma stack aparecer com ✗, o caminho está errado — volte ao passo 2.

---

## 7. Rodar a campanha

Confira o plano antes de gastar duas horas:

```bash
node orchestrator/campanha.js --dry-run
```

Deve listar **30 rodadas pendentes** (6 células × 5 repetições). Se disser
"nada a fazer", o `MAQUINA` provavelmente coincide com o de uma coleta
anterior — reveja o passo 4.

Então dispare:

```bash
node orchestrator/campanha.js
```

A partir daqui é desacompanhado. O script zera os bancos antes de cada rodada,
executa 3 minutos de carga, valida o resultado e guarda no acervo. Acompanhe
por `laboratorio/campanha.log`, que escreve em tempo real.

Se a campanha cair no meio, **basta executar de novo** — ela lê o acervo e
continua de onde parou.

---

## 8. Devolver os dados

```bash
cd tcc-pep-frontend
git add laboratorio/
git commit -m "data: campanha de coleta em <nome-da-maquina>"
git push origin dev
```

O que vai junto: os 30 CSVs originais, o índice `observacoes.json` com o perfil
de hardware carimbado em cada observação, e o `campanha.log` com a ordem de
execução e os resets.

---

## 9. Conferir o resultado

```bash
node orchestrator/analise.js --validar                  # confere as distribuições
node orchestrator/analise.js --metrica avg_ms --log     # latência
node orchestrator/analise.js --metrica rps              # vazão
```

Com dados de mais de uma máquina no acervo, a análise sinaliza a mistura. A
partir daí, duas saídas legítimas:

- **Separar**: analisar cada máquina isoladamente e comparar as conclusões.
  Se ambas apontarem o mesmo sentido, a replicação cumpriu seu papel.
- **Bloquear**: tratar `maquina` como terceiro fator. Exige refazer o modelo da
  ANOVA — o script atual assume dois fatores.

O que **não** vale é juntar tudo sem tratamento: a variação entre máquinas
entraria como se fosse ruído da arquitetura, inflando o resíduo e derrubando o
poder dos testes.

---

## Problemas comuns

**`port is already allocated`** — outra stack já ocupa a porta. As duas foram
desconflitadas (MS usa 3015, 5433, 27018, 9091, 3008, 8081), então isso
costuma ser um contêiner órfão de execução anterior: `docker ps -a`.

**Campanha para em `TIMEOUT`** — a rodada passou de 12 minutos. Quase sempre é
VM do Docker pequena demais; confira o passo 1.

**Rodadas descartadas por `samples < 1000`** — a carga não completou. Veja no
`campanha.log` se o setup do k6 falhou; normalmente um serviço não subiu.

**`Cannot POST /` nas rodadas de MS** — o `API_GATEWAY` não chegou ao k6. O
orquestrador passa essa variável automaticamente; se estiver rodando o k6 na
mão, inclua `-e API_GATEWAY=http://api-gateway:4000`.
