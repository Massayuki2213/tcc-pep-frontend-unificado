import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { SKIP_ERROR_TOAST } from '../../core/error.interceptor';

export type Arquitetura = 'monolito' | 'microsservicos';
export type Carga = 'normal' | 'dia-corrido' | 'emergencia';

/** Colunas numéricas da linha GLOBAL do CSV do k6. */
export interface MetricasRodada {
  vus_max: number | null;
  samples: number | null;
  avg_ms: number | null;
  min_ms: number | null;
  med_ms: number | null;
  p90_ms: number | null;
  p95_ms: number | null;
  p99_ms: number | null;
  max_ms: number | null;
  rps: number | null;
  error_rate_pct: number | null;
  slo_pass_pct: number | null;
}

export interface JoinRodada extends MetricasRodada {
  label: string;
  endpoint: string;
}

/** Uma rodada completa do k6 = uma observação do delineamento fatorial. */
export interface Observacao {
  id: string;
  importadoEm: string;
  arquitetura: Arquitetura;
  carga: Carga;
  origem: 'orquestrador' | 'upload';
  origemRel: string | null;
  arquivo: string;
  csvRel: string;
  timestampRodada: string | null;
  metricas: MetricasRodada;
  porJoin: JoinRodada[];
  nota: string;
}

@Injectable({ providedIn: 'root' })
export class LaboratorioService {
  private base = environment.orchestratorUrl;
  // A tela faz polling do orquestrador; falha de conexão vira estado "offline",
  // não uma enxurrada de toasts.
  private ctx = new HttpContext().set(SKIP_ERROR_TOAST, true);
  private http = inject(HttpClient);

  observacoes() {
    return this.http.get<Observacao[]>(`${this.base}/lab/observacoes`, { context: this.ctx });
  }

  /** Traz para o acervo um CSV que o próprio orquestrador gerou. */
  importar(rel: string) {
    return this.http.post<Observacao>(`${this.base}/lab/importar`, { rel });
  }

  /** Entrada manual — usada para rodadas geradas fora deste orquestrador (ex.: MS). */
  adicionar(csv: string, arquivo: string, arquitetura?: Arquitetura, carga?: Carga, nota?: string) {
    return this.http.post<Observacao>(`${this.base}/lab/observacoes`, {
      csv, arquivo, arquitetura, carga, nota,
    });
  }

  atualizar(id: string, patch: { arquitetura?: Arquitetura; carga?: Carga; nota?: string }) {
    return this.http.patch<Observacao>(`${this.base}/lab/observacoes/${id}`, patch);
  }

  remover(id: string) {
    return this.http.delete<{ removida: boolean }>(`${this.base}/lab/observacoes/${id}`);
  }

  csvUrl(id: string) {
    return `${this.base}/lab/observacoes/${id}/csv`;
  }

  datasetUrl() {
    return `${this.base}/lab/dataset.csv`;
  }
}
