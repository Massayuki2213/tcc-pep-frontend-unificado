# Guia de Integração — Frontend PEP

**Base URL:** `http://localhost:3000`  
**Swagger interativo:** `http://localhost:3000/api`

---

## 1. Configuração do cliente HTTP

O backend espera `Content-Type: application/json` em todos os POSTs e PATCHs.

```ts
// Exemplo com fetch nativo (ou adapte para axios / ky)
const api = {
  baseUrl: 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
};
```

**CORS habilitado** para `http://localhost:5173` (padrão Vite).  
Se o seu front rodar em outra porta, ajuste `CORS_ORIGIN` no `.env` do backend.

---

## 2. Formato de erro padrão

Todos os erros retornam a mesma estrutura (vem do `HttpExceptionFilter`):

```json
{
  "statusCode": 404,
  "timestamp": "2026-06-29T10:00:00.000Z",
  "path": "/pacientes/uuid-inexistente",
  "method": "GET",
  "error": "Paciente não encontrado"
}
```

Trate sempre pelo campo `statusCode` + `error`.

---

## 3. Fluxo principal de uso (ordem de operação)

```
1. Cadastrar médico     → POST /medicos
2. Cadastrar paciente   → POST /pacientes
3. Registrar triagem    → POST /atendimentos
      └─ cria automaticamente:
            - HistoricoClinico (MongoDB)
            - ConsultaLaudo de tipo TRIAGEM (MongoDB)
            - LogAuditoria (PostgreSQL)
4. Médico registra consulta → POST /consultas-laudos
      └─ novas alergias → propagadas automaticamente ao HistoricoClinico
```

---

## 4. Todas as rotas

### Pacientes

| Método | Rota | Body obrigatório |
|--------|------|-----------------|
| `POST` | `/pacientes` | ver seção 5 |
| `GET` | `/pacientes` | — |
| `GET` | `/pacientes/:id` | — |
| `PATCH` | `/pacientes/:id` | campos parciais |
| `GET` | `/pacientes/:id/historico-completo` | — |
| `DELETE` | `/pacientes/:id` | — → 204 |

### Médicos

| Método | Rota | Observação |
|--------|------|-----------|
| `POST` | `/medicos` | 409 se CRM duplicado |
| `GET` | `/medicos` | — |
| `GET` | `/medicos/ativos` | use em selects de formulário |
| `GET` | `/medicos/:id` | — |
| `PATCH` | `/medicos/:id` | — |
| `GET` | `/medicos/:id/atendimentos` | join PG→MDB |
| `GET` | `/medicos/:id/laudos` | join MDB→PG |
| `DELETE` | `/medicos/:id` | — → 204 |

### Atendimentos

| Método | Rota | Observação |
|--------|------|-----------|
| `POST` | `/atendimentos` | dual-write PG + MDB |
| `GET` | `/atendimentos` | — |
| `GET` | `/atendimentos/:id` | retorna `{ ...atendimento, consultasLaudos: [] }` |
| `PATCH` | `/atendimentos/:id` | — |
| `DELETE` | `/atendimentos/:id` | retorna **200** (não 204) |

### Consultas e Laudos *(sem PATCH/DELETE — documentos clínicos imutáveis)*

| Método | Rota |
|--------|------|
| `POST` | `/consultas-laudos` |
| `GET` | `/consultas-laudos` |
| `GET` | `/consultas-laudos/atendimento/:atendimentoId` |
| `GET` | `/consultas-laudos/paciente/:pacienteId` |

### Histórico Clínico *(somente leitura)*

| Método | Rota |
|--------|------|
| `GET` | `/historico-clinicos` |
| `GET` | `/historico-clinicos/paciente/:pacienteId` |

### Logs de Auditoria *(somente leitura)*

| Método | Rota |
|--------|------|
| `GET` | `/logs-auditoria` |
| `GET` | `/logs-auditoria/:id` |
| `GET` | `/logs-auditoria/atendimento/:atendimentoId` |
| `GET` | `/logs-auditoria/entidade/:entidade/:entidadeId` |

---

## 5. Bodies completos

### POST /pacientes
```json
{
  "nomeCompleto": "João Silva",
  "sexo": "M",
  "cpf": "12345678900",
  "dataNascimento": "1990-05-12",
  "consentimentoLgpd": true,
  "telefoneContato": "11999999999",
  "tipagemSanguinea": "A+"
}
```
> `cpf` é enviado em texto — o backend armazena apenas o hash HMAC. **Nunca trafegue CPF no front além do momento de cadastro.**

### POST /medicos
```json
{
  "nomeCompleto": "Dra. Ana Costa",
  "crm": "123456/SP",
  "especialidade": "Clínica Geral",
  "ativo": true
}
```

### POST /atendimentos
```json
{
  "pacienteId": "uuid",
  "medicoTriagemId": "uuid",
  "dataHoraEntrada": "2026-06-29T10:30:00Z",
  "queixaPrincipal": "Dor no peito",
  "classificacaoRisco": "AMARELO",
  "pressaoArterial": "120/80",
  "frequenciaCardiaca": 80,
  "saturacaoOxigenio": 98,
  "temperaturaCorporal": 36.8,
  "frequenciaRespiratoria": 16
}
```

**Enum `classificacaoRisco`:**
| Valor | Significado |
|-------|-------------|
| `VERMELHO` | Imediato |
| `LARANJA` | Muito urgente |
| `AMARELO` | Urgente |
| `VERDE` | Pouco urgente |
| `AZUL` | Não urgente |

### POST /consultas-laudos
```json
{
  "atendimentoId": "uuid-do-atendimento",
  "historicoId": "mongodb-objectid",
  "pacienteId": "uuid-do-paciente",
  "medicoId": "uuid-do-medico",
  "dataRegistro": "2026-06-29T11:00:00Z",
  "tipoRegistro": "CONSULTA",
  "descricaoClinica": "Paciente estável, sem alterações.",
  "prescricoes": [
    { "medicamento": "Dipirona", "dose": "500mg", "frequencia": "8h", "duracao": "3 dias" }
  ],
  "examesAnexos": [
    { "tipo": "ECG", "descricao": "Normal", "urlAnexo": null, "dataRealizacao": "2026-06-29" }
  ],
  "novasAlergiasIdentificadas": [
    { "substancia": "Penicilina", "severidade": "grave", "reacao": "Anafilaxia" }
  ]
}
```

**Enum `tipoRegistro`:** `TRIAGEM` | `CONSULTA` | `LAUDO` | `EVOLUCAO` | `ALTA` | `PRESCRICAO`  
**Enum `severidade`:** `leve` | `moderada` | `grave`

> **Como obter o `historicoId`:** antes do POST, chame  
> `GET /historico-clinicos/paciente/:pacienteId` → use o campo `_id` do documento retornado.

---

## 6. Armadilhas importantes

### 6.1 Rota estática antes de parâmetro dinâmico
`GET /medicos/ativos` precisa ser chamada antes de `GET /medicos/:id`.  
O NestJS já registra na ordem correta — não há problema no back, mas no front evite montar URLs como `/medicos/ativos` usando variáveis que possam virar um UUID acidentalmente.

### 6.2 DELETE /atendimentos retorna 200, não 204
Diferente dos outros DELETEs. Trate o status corretamente:
```ts
// correto
if (res.status === 200 || res.status === 204) { /* sucesso */ }
```

### 6.3 Validação de UUID
Todos os `:id` nas rotas passam por `ParseUUIDPipe`. Enviar um ID malformado retorna 400 diretamente, não 404.

### 6.4 Datas sempre em ISO 8601
`dataHoraEntrada`, `dataRegistro`, `dataNascimento` — sempre strings ISO.  
Use `new Date().toISOString()` no JS.

### 6.5 `whitelist: true` no ValidationPipe
O backend remove silenciosamente qualquer campo extra no body que não esteja no DTO.  
Se um campo não aparece no response, verifique se o nome está exato (camelCase).

### 6.6 Endpoint de visão 360° do paciente
`GET /pacientes/:id/historico-completo` é o endpoint mais rico — use-o para a tela de prontuário. Ele faz o join poliglota internamente e retorna tudo de uma vez.

### 6.7 Histórico clínico e consultas-laudos — nunca POST manual
Esses recursos são criados/atualizados automaticamente pelo back. O front nunca deve chamar `POST /historico-clinicos`.

---

## 7. Variável de ambiente para apontar o front ao back

```env
# .env do projeto frontend
VITE_API_URL=http://localhost:3000
```

```ts
const BASE = import.meta.env.VITE_API_URL;
fetch(`${BASE}/pacientes`);
```

---

## 8. Checklist antes de subir o front em produção

- [ ] `CORS_ORIGIN` no `.env` do backend apontando para o domínio de produção do front
- [ ] `VITE_API_URL` no `.env` do front apontando para o domínio de produção do back
- [ ] CPF nunca armazenado em `localStorage` / `sessionStorage`
- [ ] Nenhuma rota de escrita exposta sem confirmação de `consentimentoLgpd: true`
- [ ] Tratar todos os status de erro (400, 404, 409, 500) com mensagens amigáveis
