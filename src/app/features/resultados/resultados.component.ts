import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Analise, ResultadosService } from './resultados.service';

/** Métricas que fazem sentido como variável-resposta do experimento. */
const METRICAS = [
  { chave: 'avg_ms', nome: 'Latência média', log: true },
  { chave: 'p95_ms', nome: 'Latência p95', log: true },
  { chave: 'med_ms', nome: 'Latência mediana', log: true },
  { chave: 'rps', nome: 'Vazão', log: false },
];

const NOMES_CARGA: Record<string, string> = {
  normal: 'Normal',
  'dia-corrido': 'Dia Corrido',
  emergencia: 'Emergência',
};

@Component({
  selector: 'app-resultados',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './resultados.component.html',
})
export class ResultadosComponent implements OnInit {
  metricas = METRICAS;

  metrica = signal('avg_ms');
  // Latência tem variância que cresce com a média; o log a estabiliza e é o
  // padrão para esta análise. Vazão não precisa e vem desligado.
  usarLog = signal(true);

  analise = signal<Analise | null>(null);
  carregando = signal(true);
  offline = signal(false);

  private svc = inject(ResultadosService);

  metricaAtual = computed(() => METRICAS.find(m => m.chave === this.metrica()));
  podeLog = computed(() => this.metricaAtual()?.log ?? false);

  /** Só as comparações que confrontam arquiteturas dentro da mesma carga. */
  paresChave = computed(() => this.analise()?.posthoc?.pares.filter(p => p.mesmaCarga) ?? []);
  paresRestantes = computed(() => this.analise()?.posthoc?.pares.filter(p => !p.mesmaCarga) ?? []);

  descritivasMono = computed(() => this.analise()?.descritivas.filter(d => d.arquitetura === 'monolito') ?? []);
  descritivasMs = computed(() => this.analise()?.descritivas.filter(d => d.arquitetura === 'microsservicos') ?? []);

  /** Maior média entre as células — usada para escalar as barras. */
  maiorMedia = computed(() => {
    const ds = this.analise()?.descritivas ?? [];
    return Math.max(1, ...ds.map(d => d.media ?? 0));
  });

  ngOnInit() {
    this.carregar();
  }

  carregar() {
    this.carregando.set(true);
    this.svc.analisar(this.metrica(), this.podeLog() && this.usarLog()).subscribe({
      next: a => {
        this.analise.set(a);
        this.offline.set(false);
        this.carregando.set(false);
      },
      error: () => {
        this.offline.set(true);
        this.carregando.set(false);
      },
    });
  }

  onMetricaChange(e: Event) {
    this.metrica.set((e.target as HTMLSelectElement).value);
    if (!this.podeLog()) this.usarLog.set(false);
    this.carregar();
  }

  alternarLog() {
    this.usarLog.update(v => !v);
    this.carregar();
  }

  nomeCarga(c: string) {
    return NOMES_CARGA[c] ?? c;
  }

  /** p-valores muito pequenos não devem virar "0,0000". */
  fmtP(p: number): string {
    if (p < 0.0001) return '< 0,0001';
    return p.toFixed(4).replace('.', ',');
  }

  /** Razão 1,505 → "+50,5%". */
  pctRazao(razao: number): string {
    return `${razao >= 1 ? '+' : ''}${((razao - 1) * 100).toFixed(1).replace('.', ',')}%`;
  }

  larguraBarra(media: number | null): string {
    if (media === null) return '0%';
    return `${(media / this.maiorMedia()) * 100}%`;
  }

  datasetUrl() {
    return this.svc.datasetUrl();
  }
}
