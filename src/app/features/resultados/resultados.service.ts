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

export interface Analise {
  metrica: string;
  log: boolean;
  unidade: string;
  alfa: number;
  /** Apelidos das máquinas que produziram o acervo. */
  maquinas: string[];
  /** Mais de um hardware no mesmo acervo infla o resíduo e derruba o poder. */
  misturaMaquinas: boolean;
  total: number;
  balanceado: boolean;
  completo: boolean;
  descritivas: Descritiva[];
  testesT: TesteT[];
  anova: Anova | null;
  posthoc: { qCrit: number; hsd: number; pares: ParTukey[] } | null;
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

  datasetUrl() {
    return `${this.base}/lab/dataset.csv`;
  }
}
