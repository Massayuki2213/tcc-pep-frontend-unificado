import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { SKIP_ERROR_TOAST } from '../../core/error.interceptor';

export interface BenchmarkStatus {
  running: boolean;
  stack: string | null;
  script: string | null;
  carga: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  log: string[];
}

/** Uma das duas arquiteturas comparadas, com seus scripts k6 próprios. */
export interface StackInfo {
  valor: string;
  nome: string;
  dir: string;
  disponivel: boolean;
  scripts: string[];
}

export interface BenchmarkScenarios {
  stacks: StackInfo[];
  cargas: { valor: string; nome: string }[];
}

export interface ResultadoCsv {
  stack: string;
  stackNome: string;
  cenario: string;
  arquivo: string;
  rel: string;
  tamanhoBytes: number;
  modificadoEm: string;
}

@Injectable({ providedIn: 'root' })
export class BenchmarkService {
  private base = environment.orchestratorUrl;
  // Polling constante: erro de conexão vira "orquestrador offline", não toast
  private ctx = new HttpContext().set(SKIP_ERROR_TOAST, true);
  private http = inject(HttpClient);

  scenarios() {
    return this.http.get<BenchmarkScenarios>(`${this.base}/scenarios`, { context: this.ctx });
  }

  status() {
    return this.http.get<BenchmarkStatus>(`${this.base}/status`, { context: this.ctx });
  }

  run(stack: string, script: string, carga: string) {
    return this.http.post(`${this.base}/run`, { stack, script, carga }, { context: this.ctx });
  }

  stop() {
    return this.http.post(`${this.base}/stop`, {}, { context: this.ctx });
  }

  results() {
    return this.http.get<ResultadoCsv[]>(`${this.base}/results`, { context: this.ctx });
  }

  downloadUrl(rel: string) {
    return `${this.base}/results/download?file=${encodeURIComponent(rel)}`;
  }
}
