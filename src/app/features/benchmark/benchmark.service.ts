import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { SKIP_ERROR_TOAST } from '../../core/error.interceptor';

export interface BenchmarkStatus {
  running: boolean;
  script: string | null;
  carga: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  log: string[];
}

export interface BenchmarkScenarios {
  scripts: string[];
  cargas: { valor: string; nome: string }[];
}

export interface ResultadoCsv {
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

  constructor(private http: HttpClient) {}

  scenarios() {
    return this.http.get<BenchmarkScenarios>(`${this.base}/scenarios`, { context: this.ctx });
  }

  status() {
    return this.http.get<BenchmarkStatus>(`${this.base}/status`, { context: this.ctx });
  }

  run(script: string, carga: string) {
    return this.http.post(`${this.base}/run`, { script, carga }, { context: this.ctx });
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
