import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { SKIP_ERROR_TOAST } from '../../core/error.interceptor';

export interface Descritiva {
  arquitetura: string;
  carga: string;
  n: number;
  media: number | null;
  desvio: number | null;
  cv: number | null;
}

export interface TesteT {
  carga: string;
  insuficiente: boolean;
  mediaMono?: number;
  mediaMs?: number;
  dpMono?: number;
  dpMs?: number;
  razao?: number;
  difMedia?: number;
  welch?: { t: number; df: number; p: number };
  student?: { t: number; df: number; p: number };
  d?: number;
  significativo?: boolean;
}

export interface FatorAnova {
  nome: string;
  ss: number;
  df: number;
  ms: number;
  F: number;
  p: number;
  etaP: number;
}

export interface Anova {
  n: number;
  N: number;
  msErro: number;
  dfErro: number;
  fatores: FatorAnova[];
  residuo: { ss: number; df: number; ms: number };
}

export interface ParTukey {
  a: string;
  b: string;
  dif: number;
  q: number;
  p: number;
  significativo: boolean;
  mesmaCarga: boolean;
}

/** Diagnóstico do pressuposto de normalidade dos resíduos. */
export interface Normalidade {
  n: number;
  degenerado: boolean;
  assimetria: number | null;
  curtose: number | null;
  zAssimetria?: number;
  zCurtose?: number;
  aceitavel?: boolean;
  qq: { teorico: number; observado: number }[];
  extremos?: number[];
}

export interface Analise {
  metrica: string;
  log: boolean;
  unidade: string;
  alfa: number;
  /** Apelidos das máquinas que produziram o acervo. */
  maquinas: string[];
  /** Mais de um hardware no mesmo acervo infla o resíduo e derruba o poder. */
  misturaMaquinas: boolean;
  normalidade: Normalidade | null;
  total: number;
  balanceado: boolean;
  completo: boolean;
  descritivas: Descritiva[];
  testesT: TesteT[];
  anova: Anova | null;
  /**
   * Modelo de três fatores — só existe quando o acervo tem mais de uma máquina.
   * Com hardwares distintos, é ele o modelo correto: o de dois fatores joga a
   * variação entre máquinas no resíduo e a credita à arquitetura.
   */
  anova3: Anova3 | null;
  posthoc: { qCrit: number; hsd: number; pares: ParTukey[] } | null;
}

export interface Anova3 {
  indisponivel?: boolean;
  motivo?: string;
  n?: number;
  N?: number;
  /** Conferência interna: num delineamento balanceado a decomposição é exata. */
  decomposicaoExata?: boolean;
  degenerado?: boolean;
  fatores?: FatorAnova[];
  residuo?: { ss: number; df: number; ms: number };
}

@Injectable({ providedIn: 'root' })
export class ResultadosService {
  private base = environment.orchestratorUrl;
  // Orquestrador offline é estado esperado nesta tela — vira aviso, não toast
  private ctx = new HttpContext().set(SKIP_ERROR_TOAST, true);
  private http = inject(HttpClient);

  analisar(metrica: string, log: boolean) {
    return this.http.get<Analise>(
      `${this.base}/lab/analise?metrica=${encodeURIComponent(metrica)}&log=${log ? 1 : 0}`,
      { context: this.ctx },
    );
  }

  resumir() {
    return this.http.get<Resumo>(`${this.base}/lab/resumo`, { context: this.ctx });
  }

  porEndpoint(metrica = 'avg_ms') {
    return this.http.get<AnaliseEndpoints>(
      `${this.base}/lab/endpoints?metrica=${encodeURIComponent(metrica)}`,
      { context: this.ctx },
    );
  }

  datasetUrl() {
    return `${this.base}/lab/dataset.csv`;
  }
}

/** Consolidado das quatro famílias de métricas — alimenta o painel de veredito. */
export interface ResumoMetrica {
  chave: string;
  rotulo: string;
  unidade: string;
  melhor: 'menor' | 'maior' | null;
  porCarga: {
    carga: string;
    monolito: number | null;
    microsservicos: number | null;
    difPct: number | null;
    p: number | null;
    d: number | null;
    significativo: boolean;
  }[];
  anova: Record<string, { p: number; etaP: number }> | null;
  normalidadeOk: boolean | null;
}

export interface Aproveitamento {
  arquitetura: string;
  carga: string;
  rps: number;
  cores: number;
  rpsPorCore: number | null;
  pctOrcamento: number;
}

export interface Resumo {
  total: number;
  metricas: ResumoMetrica[];
  aproveitamento: Aproveitamento[];
  orcamentoCpus: number;
}

/** Descritiva de uma célula dentro de um endpoint. */
export interface CelulaEndpoint {
  n: number;
  media: number | null;
  desvio: number | null;
}

export interface CargaEndpoint {
  carga: string;
  monolito: CelulaEndpoint;
  microsservicos: CelulaEndpoint;
  razao: number | null;
  /** Taxa de chegada que cada arquitetura de fato impôs a este endpoint. */
  chegada: { monolito: number | null; microsservicos: number | null };
  insuficiente?: boolean;
  degenerado?: boolean;
  p?: number;
  d?: number;
  significativo?: boolean;
  vence?: 'monolito' | 'microsservicos' | null;
}

export interface Endpoint {
  label: string;
  endpoint: string;
  porCarga: CargaEndpoint[];
  /** Latência em emergência ÷ latência em normal, por arquitetura. */
  degradacao: Record<string, number | null>;
  sloEmergencia: Record<string, number | null>;
  vencedorEmergencia: 'monolito' | 'microsservicos' | null;
  significativoEmergencia: boolean;
}

export interface AnaliseEndpoints {
  metrica: string;
  unidade: string;
  alfa: number;
  total: number;
  maquinas: string[];
  endpoints: Endpoint[];
  isolamento: {
    ganhosMicrosservicos: string[];
    piorDegradacao: Record<string, number | null>;
  };
}
